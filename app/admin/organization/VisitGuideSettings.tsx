import { prisma } from "../../../lib/prisma";
import { readVisitGuides } from "../../../lib/crm/visitGuides";
import { CrmForm } from "../../components/CrmForm";
import { saveVisitGuides } from "./visit-guide-actions";
export async function VisitGuideSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { crmPreferences: true },
  });
  return (
    <details className="card">
      <summary>Log Visit guides</summary>
      <p>
        Optional prompts appear inside Log Visit. Keep each prompt on a separate
        line, up to eight per account type.
      </p>
      <CrmForm action={saveVisitGuides} submitLabel="Save visit guides">
        {readVisitGuides(org.crmPreferences).map((g) => (
          <fieldset key={g.accountType}>
            <legend>
              {g.accountType === "AGENCY" ? "Agency" : "Wholesale"}
            </legend>
            <label>
              Guide name
              <input
                name={`${g.accountType}Name`}
                maxLength={100}
                defaultValue={g.name}
                required
              />
            </label>
            <label>
              Prompts
              <textarea
                name={`${g.accountType}Questions`}
                rows={5}
                defaultValue={g.questions.join("\n")}
                required
              />
            </label>
          </fieldset>
        ))}
      </CrmForm>
    </details>
  );
}
