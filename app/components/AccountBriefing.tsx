import { AccountAssistant } from "../account-memory/AccountAssistant";
import { prisma } from "../../lib/prisma";
import { getAccountBriefing } from "../../lib/crm/briefing";
import type { CrmAccount, CrmActor } from "../../lib/crm/activity";
import { formatEasternDate } from "../../lib/dateTime";
export async function AccountBriefing({
  account,
  actor,
  lastPurchaseAt,
}: {
  account: CrmAccount;
  actor: CrmActor;
  lastPurchaseAt?: Date | null;
}) {
  const briefing = await getAccountBriefing(
    prisma,
    actor,
    account,
    new Date(),
    lastPurchaseAt ?? null,
  );
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { crmPreferences: true },
  });
  const live =
    (org.crmPreferences as { aiEnabled?: boolean })?.aiEnabled === true &&
    process.env.CRM_AI_ENABLED === "true" &&
    Boolean(process.env.OPENAI_API_KEY) &&
    Boolean(process.env.CRM_AI_MODEL);
  return (
    <details className="compact-details">
      <summary>Before your next conversation · Account briefing</summary>
      <dl className="crm-facts">
        {[
          ["Last contact", briefing.lastContact],
          ["Meaningful interaction", briefing.lastMeaningful],
          ["Physical visit", briefing.lastVisit],
          ["Completed follow-up", briefing.lastFollowUp],
          ["Latest purchase evidence", lastPurchaseAt],
        ].map(([label, date]) => (
          <div key={String(label)}>
            <dt>{String(label)}</dt>
            <dd>
              {date instanceof Date ? formatEasternDate(date) : "Not recorded"}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        <strong>
          {briefing.health.score === null
            ? "Health: insufficient evidence"
            : `Relationship health: ${briefing.health.score}/100`}
        </strong>
      </p>
      {briefing.health.reasons.length ? (
        <ul>
          {briefing.health.reasons.map((reason) => (
            <li key={reason.label}>
              {reason.label} · −{reason.penalty} points
            </li>
          ))}
        </ul>
      ) : null}
      {briefing.health.missing.length ? (
        <p className="muted">
          Missing: {briefing.health.missing.join(", ")}. Missing data is not
          zero performance.
        </p>
      ) : null}
      <p>
        <strong>{briefing.indicators.status}</strong>
      </p>
      {briefing.indicators.reasons.length ? (
        <ul>
          {briefing.indicators.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <p>{briefing.indicators.nextAction}</p>
      <p className="muted">
        Based on records you can see. Purchase evidence may reflect a reporting
        date. Invitations alone do not establish that a meeting happened.
      </p>
      <AccountAssistant account={account} live={live} />
    </details>
  );
}
