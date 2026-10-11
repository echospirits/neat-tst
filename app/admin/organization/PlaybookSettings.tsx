import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { playbookStep } from "../../../lib/crm/playbooks";
import { CrmForm } from "../../components/CrmForm";
import { addDefaultPlaybooks } from "../../account-memory/playbook-actions";
import { PlaybookEditor } from "./PlaybookEditor";
export async function PlaybookSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const templates = await prisma.salesPlaybook.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return (
    <section className="card">
      <h2>Sales playbooks</h2>
      <p className="muted">
        Reusable sequences of Worklist tasks. People review and carry out each
        step; starting a playbook does not send messages.
      </p>
      <details>
        <summary>Manage playbook templates</summary>
        <CrmForm
          action={addDefaultPlaybooks}
          submitLabel="Add starter templates"
        />
        {templates.map((t) => (
          <PlaybookEditor
            key={`${t.id}:${t.version}`}
            template={{ ...t, steps: z.array(playbookStep).parse(t.steps) }}
          />
        ))}
        <PlaybookEditor />
      </details>
    </section>
  );
}
