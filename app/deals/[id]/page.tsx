import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import {
  accountHref,
  accountQuery,
  assertAccount,
} from "../../../lib/crm/activity";
import { dealStatuses } from "../../../lib/crm/deals";
import { isAdminRole } from "../../../lib/userAccess";
import { PageHeader } from "../../components/PageChrome";
import { CrmForm } from "../../components/CrmForm";
import { ContextualActions } from "../../components/ContextualActions";
import { moveDealAction } from "../../crm/actions";
export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor, user, timezone } = await requireCrmActor(),
    { id } = await params;
  const [deal, stages] = await Promise.all([
    prisma.deal.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        stage: true,
        events: { orderBy: { occurredAt: "desc" }, take: 50 },
      },
    }),
    prisma.dealStage.findMany({
      where: { organizationId: actor.organizationId, active: true },
      orderBy: { position: "asc" },
    }),
  ]);
  if (!deal) notFound();
  const account = deal.agencyId
    ? { accountType: "AGENCY" as const, accountId: deal.agencyId }
    : {
        accountType: "WHOLESALE" as const,
        accountId: deal.wholesaleAccountId!,
      };
  const accountRecord = await assertAccount(prisma, account);
  return (
    <>
      <PageHeader
        title={deal.title}
        description={`${deal.status} · ${deal.stage.name}`}
        actions={
          <Link
            className="btn secondary"
            href={`/deals?${accountQuery(account)}`}
          >
            Back to deals
          </Link>
        }
      />
      <div className="crm-actions">
        <Link href={accountHref(account)}>Open account</Link>
        <Link href={`/activities?${accountQuery(account)}`}>
          Relationship timeline
        </Link>
        <Link href={`${accountHref(account)}#account-worklist`}>
          Account Worklist
        </Link>
      </div>
      <section className="card crm-panel">
        <h2>Deal details</h2>
        <p>
          {deal.revenueCents === null
            ? "Revenue not estimated"
            : new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(deal.revenueCents / 100)}{" "}
          · {deal.probability}% probability
        </p>
        {deal.expectedCloseAt ? (
          <p>
            Expected close: {deal.expectedCloseAt.toISOString().slice(0, 10)}
          </p>
        ) : null}
        {deal.targetProducts.length ? (
          <p>Products: {deal.targetProducts.join(", ")}</p>
        ) : null}
        {deal.nextAction ? <p>Next action: {deal.nextAction}</p> : null}
        <ContextualActions
          currentUserId={actor.userId}
          users={[{ id: user.id, name: user.name ?? "Me" }]}
          context={{
            ...(account.accountType === "AGENCY"
              ? { agencyId: account.accountId }
              : { wholesaleAccountId: account.accountId }),
            accountName: accountRecord.name,
            sourceLabel: deal.title,
            reason: deal.nextAction,
            returnTo: `/deals/${deal.id}`,
          }}
        />
        {deal.notes ? <p className="crm-prewrap">{deal.notes}</p> : null}
        {deal.competitors ? <p>Competitors: {deal.competitors}</p> : null}
        {deal.objections ? <p>Objections: {deal.objections}</p> : null}
      </section>
      {deal.ownerUserId === actor.userId || isAdminRole(user.role) ? (
        <section className="card crm-panel">
          <h2>Update stage or outcome</h2>
          <CrmForm action={moveDealAction} submitLabel="Save deal progress">
            <input type="hidden" name="id" value={deal.id} />
            <input type="hidden" name="version" value={deal.version} />
            <label htmlFor="stage">Stage</label>
            <select name="stageId" id="stage" defaultValue={deal.stageId}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label htmlFor="status">Outcome</label>
            <select id="status" name="status" defaultValue={deal.status}>
              {dealStatuses.map((s) => (
                <option value={s} key={s}>
                  {s === "OPEN" && deal.status !== "OPEN" ? "Reopen" : s}
                </option>
              ))}
            </select>
            <label htmlFor="reason">
              Reason (required for loss or reopening)
            </label>
            <textarea id="reason" name="note" maxLength={1000} />
          </CrmForm>
          <p className="muted">
            Stage moves use the stage’s configured probability. Winning a deal
            does not create a verified sale or complete Worklist tasks.
          </p>
        </section>
      ) : (
        <p>
          Only the owner or an organization administrator can update this deal.
        </p>
      )}
      <section className="card crm-panel">
        <h2>Stage history</h2>
        <ol>
          {deal.events.map((e) => (
            <li key={e.id}>
              {e.occurredAt.toLocaleString("en-US", {
                timeZone: timezone,
                timeZoneName: "short",
              })}{" "}
              —{" "}
              {stages.find((s) => s.id === e.toStageId)?.name ?? "Former stage"}{" "}
              · {e.toStatus}
              {e.note ? `: ${e.note}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
