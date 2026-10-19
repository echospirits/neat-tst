import { prisma } from "../../../lib/prisma";
import { healthRules } from "../../../lib/crm/health";
import { saveRelationshipSettings } from "./relationship-actions";
import { CrmForm } from "../../components/CrmForm";
export async function RelationshipSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { crmPreferences: true },
  });
  const rules = healthRules(
    (org.crmPreferences as Record<string, unknown>)?.health,
  );
  return (
    <details className="card crm-panel">
      <summary>Relationship health &amp; Pipeline thresholds</summary>
      <p className="muted">
        Health uses contact recency, purchasing evidence, contact coverage, and
        overdue Worklist commitments. Missing history stays unknown.
      </p>
      <CrmForm
        action={saveRelationshipSettings}
        submitLabel="Save relationship thresholds"
      >
        {(
          [
            ["agencyContactDays", "Agency contact interval"],
            ["wholesaleContactDays", "Wholesale contact interval"],
            ["chainContactDays", "Chain contact interval"],
            ["purchaseDays", "Purchasing lapse interval"],
            ["waitingDays", "Waiting on Order interval"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label} (days)
            <input
              name={key}
              defaultValue={rules[key]}
              type="number"
              min="1"
              max="730"
              required
            />
          </label>
        ))}
      </CrmForm>
    </details>
  );
}
