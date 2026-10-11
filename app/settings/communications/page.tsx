import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import { mailConfig } from "../../../lib/crm/mail/oauth";
import { getAppEnvironment } from "../../../lib/appEnvironment";
import { PageHeader, EmptyState } from "../../components/PageChrome";
import { CrmForm } from "../../components/CrmForm";
import { CrmAccountPicker } from "../../components/CrmAccountPicker";
import { timelineCursorWhere } from "../../../lib/crm/activity";
import {
  syncMailboxAction,
  disconnectMailboxAction,
  demoMailboxAction,
  mailboxSettingsAction,
  correctActivityAction,
} from "../../crm/actions";
export const dynamic = "force-dynamic";
export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    review?: string;
    before?: string;
    beforeId?: string;
  }>;
}) {
  const { actor, user } = await requireCrmActor(),
    params = await searchParams;
  if (
    user.role === "PLATFORM_ADMIN" ||
    user.organizationId !== actor.organizationId
  )
    return (
      <PageHeader
        title="Communications"
        description="Mailbox connections belong to their individual organization members. Support View does not grant access to private correspondence."
      />
    );
  const date = params.before ? new Date(params.before) : undefined;
  const before = date && Number.isFinite(date.getTime()) ? date : undefined;
  const [connections, review] = await Promise.all([
    prisma.mailboxConnection.findMany({
      where: actor,
      select: {
        id: true,
        provider: true,
        email: true,
        enabled: true,
        lastSyncAt: true,
        errorCode: true,
        historyDays: true,
        retentionDays: true,
        excludeInternal: true,
      },
    }),
    prisma.accountActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        connectionId: { not: null },
        AND: [
          timelineCursorWhere(
            "occurredAt",
            "activity:",
            before,
            params.beforeId,
          ),
        ],
        ...(params.review === "all" ? {} : { matchStatus: "REVIEW" }),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 51,
    }),
  ]);
  const statuses: Record<string, string> = {
    connected:
      "Mailbox connected. Synchronize to import your selected history.",
    "not-configured":
      "This provider has not been configured for this environment.",
    "authorization-failed":
      "Authorization did not finish. Check permissions and reconnect.",
  };
  return (
    <>
      <PageHeader
        title="Communications"
        description="Connect your mailbox and review how correspondence is associated with accounts."
      />
      {params.status && statuses[params.status] ? (
        <p role="status">{statuses[params.status]}</p>
      ) : null}
      <section className="card crm-panel">
        <h2>Mailbox privacy</h2>
        <p>
          Imported subject, participants and timestamps are visible only to you
          until you explicitly share an activity. Message bodies and attachments
          are not stored. Internal-only conversations are excluded by default
          using your organization’s user email addresses.
        </p>
        <p className="muted">
          Google reads mailbox metadata and your primary calendar; Microsoft
          reads Inbox, Sent Items and a bounded calendar window. A calendar
          event is an appointment, not evidence of a completed visit.
        </p>
        <div className="crm-actions">
          {(["GOOGLE", "MICROSOFT"] as const).map((provider) => {
            let available = true;
            try {
              mailConfig(provider);
            } catch {
              available = false;
            }
            return available ? (
              <Link
                key={provider}
                className="btn"
                href={`/api/crm/mail/${provider.toLowerCase()}/connect`}
              >
                Connect{" "}
                {provider === "GOOGLE" ? "Google Workspace" : "Microsoft 365"}
              </Link>
            ) : (
              <span key={provider}>
                {provider === "GOOGLE" ? "Google Workspace" : "Microsoft 365"} —
                administrator configuration required
              </span>
            );
          })}
        </div>
        {getAppEnvironment() !== "production" ? (
          <details>
            <summary>Try fixture mode</summary>
            <p>
              No external provider is contacted. Fixture records are labelled
              MOCK.
            </p>
            <CrmForm
              action={demoMailboxAction}
              submitLabel="Create demo connection"
            />
          </details>
        ) : null}
      </section>
      {connections.map((c) => (
        <section className="card crm-panel" key={c.id}>
          <h2>{c.provider === "MOCK" ? "Demo mailbox" : c.email}</h2>
          <p>
            {c.enabled ? "Connected" : "Disconnected"} ·{" "}
            {c.lastSyncAt
              ? `Last page synchronized ${c.lastSyncAt.toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
              : "Not synchronized yet"}
          </p>
          {c.errorCode ? (
            <p role="status">
              {c.errorCode === "RECONNECT"
                ? "Reconnect to renew mailbox access."
                : "The last synchronization failed. Retry after a short wait."}
            </p>
          ) : null}
          {c.enabled ? (
            <CrmForm
              action={syncMailboxAction}
              submitLabel="Synchronize next page"
            >
              <input type="hidden" name="id" value={c.id} />
            </CrmForm>
          ) : null}
          <details>
            <summary>Scope and retention</summary>
            <CrmForm action={mailboxSettingsAction} submitLabel="Save scope">
              <input type="hidden" name="id" value={c.id} />
              <label htmlFor={`history-${c.id}`}>Historical days (1–90)</label>
              <input
                id={`history-${c.id}`}
                name="historyDays"
                type="number"
                min={1}
                max={90}
                defaultValue={c.historyDays}
              />
              <label htmlFor={`retention-${c.id}`}>Retain days (7–365)</label>
              <input
                id={`retention-${c.id}`}
                name="retentionDays"
                type="number"
                min={7}
                max={365}
                defaultValue={c.retentionDays}
              />
              <label className="crm-check">
                <input
                  name="excludeInternal"
                  type="checkbox"
                  defaultChecked={c.excludeInternal}
                />
                Exclude internal-only conversations
              </label>
              <p className="muted">
                The next successful sync removes records older than retention
                and restarts the selected history scan. Provider originals are
                unchanged.
              </p>
            </CrmForm>
          </details>
          <details>
            <summary>Disconnect or remove imported history</summary>
            <CrmForm
              action={disconnectMailboxAction}
              submitLabel="Disconnect mailbox"
              confirm="Disconnect this mailbox and remove its stored tokens? If selected, imported history will also be deleted."
            >
              <input name="id" type="hidden" value={c.id} />
              <label className="crm-check">
                <input type="checkbox" name="deleteHistory" />
                Also delete this connection’s imported metadata and association
                audit history
              </label>
            </CrmForm>
          </details>
        </section>
      ))}
      <section className="crm-panel">
        <h2>Association review</h2>
        <div className="crm-actions">
          <Link href="/settings/communications">Needs review</Link>
          <Link href="/settings/communications?review=all">
            Recent imported activity
          </Link>
        </div>
        <p>
          Only an unambiguous exact active-contact email match is automatically
          assigned. Domains alone do not identify accounts. You can correct an
          association or explicitly share an activity with your team.
        </p>
        {!review.length ? (
          <EmptyState
            title="No records to review"
            description="Synchronize a connection or choose recent imported activity to correct an existing association."
          />
        ) : (
          review.slice(0, 50).map((a) => (
            <article className="card crm-panel" key={a.id}>
              <h3>{a.summary || "Untitled activity"}</h3>
              <p className="muted">
                {a.source} · {a.occurredAt.toLocaleDateString()} ·{" "}
                {a.visibility === "PRIVATE" ? "Only you" : "Shared with team"} ·{" "}
                {a.matchStatus}
              </p>
              <details>
                <summary>Associate or correct this activity</summary>
                <CrmForm
                  action={correctActivityAction}
                  submitLabel="Save association"
                >
                  <input type="hidden" name="id" value={a.id} />
                  <CrmAccountPicker />
                  <label htmlFor={`visibility-${a.id}`}>Visible to</label>
                  <select
                    id={`visibility-${a.id}`}
                    name="visibility"
                    defaultValue={a.visibility}
                  >
                    <option value="PRIVATE">Only me</option>
                    <option value="TEAM">Organization team</option>
                  </select>
                  <p className="muted">
                    Sharing makes this subject and participant metadata
                    available to your organization. Corrections are audited.
                  </p>
                </CrmForm>
              </details>
            </article>
          ))
        )}
        {review.length > 50 ? (
          <Link
            className="btn secondary"
            href={`/settings/communications?${new URLSearchParams({ ...(params.review === "all" ? { review: "all" } : {}), before: review[49].occurredAt.toISOString(), beforeId: `activity:${review[49].id}` })}`}
          >
            Earlier imported activity
          </Link>
        ) : null}
      </section>
    </>
  );
}
