import { prisma } from "../../../lib/prisma";
import { readPipelineStages } from "../../../lib/crm/pipelineStages";
import { PipelineStageEditor } from "./PipelineStageEditor";
export async function PipelineStageSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const org = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { crmPreferences: true },
    }),
    configuration = readPipelineStages(org.crmPreferences);
  return (
    <PipelineStageEditor
      key={configuration.version}
      configuration={configuration}
    />
  );
}
