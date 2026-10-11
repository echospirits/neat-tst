import { prisma } from "../../../lib/prisma";
import { CrmForm } from "../../components/CrmForm";
import { saveAiSetting } from "./ai-actions";
export async function AiSettings({
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
      <summary>Optional communication AI</summary>
      <CrmForm action={saveAiSetting} submitLabel="Save AI preference">
        <p>
          Allow members to request reviewed summaries and drafts through the
          configured provider. Each request needs the member’s acknowledgment.
          Private records remain excluded unless their owner opts in for that
          request. AI interpretation is not verified evidence; nothing is sent
          automatically.
        </p>
        <label>
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={
              (org.crmPreferences as { aiEnabled?: boolean })?.aiEnabled ===
              true
            }
          />
          Enable reviewed AI for this organization
        </label>
        <p className="field-note">
          Without deployment configuration, the assistant uses a clearly labeled
          local preview. Provider retention and processing terms must be
          reviewed before activation.
        </p>
      </CrmForm>
    </details>
  );
}
