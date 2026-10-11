import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountActivityType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import {
  accountInput,
  accountHref,
  accountQuery,
  assertAccount,
  readTimeline,
  activityLabels,
} from "../../lib/crm/activity";
import { getAccountBriefing } from "../../lib/crm/briefing";
import { PageHeader, EmptyState } from "../components/PageChrome";
import { CrmActivityForm } from "../components/CrmActivityForm";
import { LiveFilterForm } from "../components/LiveFilterForm";
import { ContextualActions } from "../components/ContextualActions";
export const dynamic = "force-dynamic";
export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { actor, user, timezone } = await requireCrmActor(),
    params = await searchParams;
  const parsed = accountInput.safeParse(params);
  if (!parsed.success)
    return (
      <>
        <PageHeader
          title="Activities"
          description="Log completed contact, or open an account to review its relationship timeline."
        />
        <CrmActivityForm />
        <Link href="/search">Find an account</Link>
      </>
    );
  const account = parsed.data;
  const record = await assertAccount(prisma, account).catch(() => null);
  if (!record) notFound();
  const type = Object.values(AccountActivityType).includes(
    params.type as AccountActivityType,
  )
    ? params.type
    : undefined;
  const date = params.before ? new Date(params.before) : undefined;
  const before = date && Number.isFinite(date.getTime()) ? date : undefined;
  const [timeline, briefing] = await Promise.all([
    readTimeline(prisma, actor, account, {
      type,
      before,
      beforeId: params.beforeId,
    }),
    getAccountBriefing(prisma, actor, account),
  ]);
  const format = (value: Date | null) =>
    value
      ? value.toLocaleDateString("en-US", { timeZone: timezone })
      : "Not recorded";
  return (
    <>
      <PageHeader
        eyebrow={record.name}
        title="Relationship activity"
        actions={
          <Link className="btn secondary" href={accountHref(account)}>
            Back to account
          </Link>
        }
      />
      <section className="card crm-panel">
        <h2>Account briefing</h2>
        <p>
          <strong>{briefing.indicators.status}</strong>
        </p>
        <dl className="crm-facts">
          <div>
            <dt>Last contact</dt>
            <dd>{format(briefing.lastContact)}</dd>
          </div>
          <div>
            <dt>Meaningful interaction</dt>
            <dd>{format(briefing.lastMeaningful)}</dd>
          </div>
          <div>
            <dt>Physical visit</dt>
            <dd>{format(briefing.lastVisit)}</dd>
          </div>
          <div>
            <dt>Completed follow-up</dt>
            <dd>{format(briefing.lastFollowUp)}</dd>
          </div>
        </dl>
        {briefing.indicators.reasons.length ? (
          <ul>
            {briefing.indicators.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        <p>{briefing.indicators.nextAction}</p>
        <ContextualActions
          currentUserId={actor.userId}
          users={[{ id: user.id, name: user.name ?? "Me" }]}
          context={{
            ...(account.accountType === "AGENCY"
              ? { agencyId: account.accountId }
              : { wholesaleAccountId: account.accountId }),
            accountName: record.name,
            reason: briefing.indicators.nextAction,
            sourceLabel: "relationship briefing",
            returnTo: `/activities?${accountQuery(account)}`,
          }}
        />
        <p className="muted">
          Based on records you can see. These indicators do not measure
          purchasing health. Calendar invitations are not proof a meeting
          happened.
        </p>
        <div className="crm-actions">
          <Link
            className="btn secondary"
            href={`${accountHref(account)}#account-worklist`}
          >
            Review account work
          </Link>
          <Link
            className="btn secondary"
            href={`/deals?${accountQuery(account)}`}
          >
            View deals
          </Link>
        </div>
      </section>
      <details className="card crm-panel">
        <summary>Log activity for {record.name}</summary>
        <CrmActivityForm account={{ ...account, name: record.name }} />
      </details>
      <section className="crm-panel">
        <h2>Timeline</h2>
        <LiveFilterForm className="crm-form">
          <input type="hidden" name="accountType" value={account.accountType} />
          <input type="hidden" name="accountId" value={account.accountId} />
          <label htmlFor="activity-type">Activity type</label>
          <select name="type" id="activity-type" defaultValue={type ?? ""}>
            <option value="">All activity, visits and completed tasks</option>
            {Object.entries(activityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </LiveFilterForm>
        {timeline.entries.length ? (
          <ol className="crm-timeline">
            {timeline.entries.map((entry) => (
              <li className="card" key={entry.id}>
                <div className="crm-entry-meta">
                  <span>
                    {activityLabels[entry.type as AccountActivityType] ??
                      entry.type.replaceAll("_", " ")}
                  </span>
                  <time dateTime={entry.at.toISOString()}>
                    {entry.at.toLocaleString("en-US", {
                      timeZone: timezone,
                      timeZoneName: "short",
                    })}{" "}
                  </time>
                  <span>
                    {entry.private ? "Only you" : "Team"} · {entry.source}
                  </span>
                </div>
                <h3>
                  {entry.href ? (
                    <Link href={entry.href}>{entry.title}</Link>
                  ) : (
                    entry.title
                  )}
                </h3>
                {entry.detail ? (
                  <p className="crm-prewrap">{entry.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No visible activity"
            description="Log an interaction or adjust the filter. Private correspondence belonging to other users is excluded."
          />
        )}
        {timeline.hasMore ? (
          <Link
            className="btn secondary"
            href={`/activities?${accountQuery(account)}&${new URLSearchParams({ ...(type ? { type } : {}), before: timeline.entries.at(-1)!.at.toISOString(), beforeId: timeline.entries.at(-1)!.id })}`}
          >
            Earlier activity
          </Link>
        ) : null}
      </section>
    </>
  );
}
