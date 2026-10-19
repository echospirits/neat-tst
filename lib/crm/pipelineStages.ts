import { z } from "zod";
import { AccountSalesStatus } from "@prisma/client";
export const pipelineStagesInput = z
  .object({
    version: z.coerce.number().int().min(0),
    stages: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          name: z.string().trim().min(1).max(80),
          status: z.nativeEnum(AccountSalesStatus),
        }),
      )
      .max(20),
  })
  .refine(
    (c) =>
      new Set(c.stages.map((s) => s.id)).size === c.stages.length &&
      new Set(c.stages.map((s) => s.name.toLowerCase())).size ===
        c.stages.length,
  );
export const beverageStages = [
  ["target", "Target identified", "TARGET"],
  ["contact", "Initial contact", "CONTACTED"],
  ["discovery", "Discovery", "ENGAGED"],
  ["sample", "Sample or presentation", "INTERESTED"],
  ["evaluation", "Buyer evaluation", "INTERESTED"],
  ["commitment", "Placement commitment", "WAITING_ON_ORDER"],
  ["first-order", "First order", "PURCHASING"],
  ["repeat-order", "Repeat order", "PURCHASING"],
  ["established", "Established account", "PURCHASING"],
].map(([id, name, status]) => ({
  id,
  name,
  status: status as AccountSalesStatus,
}));
export function readPipelineStages(preferences: unknown) {
  const result = pipelineStagesInput.safeParse(
    (preferences as { pipelineStages?: unknown })?.pipelineStages,
  );
  return result.success ? result.data : { version: 0, stages: [] };
}
export function effectivePipelineStage(
  stages: ReturnType<typeof readPipelineStages>["stages"],
  plan: unknown,
  status: AccountSalesStatus | null,
) {
  const key = (plan as { stageKey?: string })?.stageKey;
  return stages.find((s) => s.id === key && s.status === status) ?? null;
}
