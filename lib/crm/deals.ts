import { z } from "zod";
import {
  accountInput,
  accountWhere,
  assertAccount,
  assertContact,
  CrmError,
  type CrmActor,
  type CrmDb,
} from "./activity";
export const DEFAULT_DEAL_STAGES = [
  ["Target identified", 5],
  ["Initial contact", 10],
  ["Discovery", 20],
  ["Sample or presentation", 30],
  ["Buyer evaluation", 45],
  ["Placement commitment", 60],
  ["First order", 75],
  ["Repeat order", 90],
  ["Established account", 100],
] as const;
export const dealStatuses = ["OPEN", "WON", "LOST", "PAUSED"] as const;
export function revenueCentsFromInput(value: unknown) {
  if (value === "" || value == null) return undefined;
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value))
    throw new CrmError(
      "Enter revenue as a nonnegative USD amount with at most two decimal places.",
    );
  const cents = Math.round(Number(value) * 100);
  if (cents > 2000000000)
    throw new CrmError("Revenue estimate exceeds the supported amount.");
  return cents;
}
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    schema.optional(),
  );
export const createDealInput = accountInput.extend({
  title: z.string().trim().min(1).max(200),
  stageId: z.string().min(1),
  contactId: z.string().optional(),
  revenueCents: optionalNumber(z.coerce.number().int().min(0).max(2000000000)),
  probability: optionalNumber(z.coerce.number().int().min(0).max(100)),
  volume: optionalNumber(z.coerce.number().min(0).max(10000000)),
  expectedCloseAt: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date().optional(),
  ),
  targetProducts: z.string().max(2000).optional(),
  nextAction: z.string().max(500).optional(),
  competitors: z.string().max(2000).optional(),
  objections: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  submissionKey: z.string().uuid(),
});
export async function initializeDealStages(db: CrmDb, actor: CrmActor) {
  // Explicit setup action; reads never create tenant data.
  if (
    await db.dealStage.count({
      where: { organizationId: actor.organizationId },
    })
  )
    return;
  await db.dealStage.createMany({
    data: DEFAULT_DEAL_STAGES.map(([name, probability], position) => ({
      organizationId: actor.organizationId,
      name,
      probability,
      position,
    })),
    skipDuplicates: true,
  });
}
export async function createDeal(db: CrmDb, actor: CrmActor, raw: unknown) {
  const data = createDealInput.parse(raw);
  await assertAccount(db, data);
  await assertContact(db, actor, data, data.contactId);
  const stage = await db.dealStage.findFirst({
    where: {
      id: data.stageId,
      organizationId: actor.organizationId,
      active: true,
    },
  });
  if (!stage)
    throw new CrmError("Choose an active stage from this organization.");
  const existing = await db.deal.findUnique({
    where: {
      organizationId_submissionKey: {
        organizationId: actor.organizationId,
        submissionKey: `${actor.userId}:${data.submissionKey}`,
      },
    },
  });
  if (existing) return existing;
  const deal = await db.deal.create({
    data: {
      organizationId: actor.organizationId,
      ...accountWhere(data),
      ownerUserId: actor.userId,
      contactId: data.contactId || null,
      title: data.title,
      stageId: stage.id,
      probability: data.probability ?? stage.probability,
      revenueCents: data.revenueCents,
      volume: data.volume,
      expectedCloseAt: data.expectedCloseAt,
      targetProducts:
        data.targetProducts
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [],
      nextAction: data.nextAction,
      competitors: data.competitors,
      objections: data.objections,
      notes: data.notes,
      submissionKey: `${actor.userId}:${data.submissionKey}`,
    },
  });
  await db.dealEvent.create({
    data: {
      organizationId: actor.organizationId,
      dealId: deal.id,
      actorUserId: actor.userId,
      toStageId: stage.id,
      toStatus: "OPEN",
      note: "Deal created; stages are seller assertions, not verified purchases.",
    },
  });
  return deal;
}
export async function moveDeal(
  db: CrmDb,
  actor: CrmActor,
  raw: unknown,
  canManageTeam = false,
) {
  const input = z
    .object({
      id: z.string().min(1),
      version: z.coerce.number().int().positive(),
      stageId: z.string().min(1),
      status: z.enum(dealStatuses),
      note: z.string().trim().max(1000).optional(),
    })
    .parse(raw);
  const deal = await db.deal.findFirst({
    where: {
      id: input.id,
      organizationId: actor.organizationId,
      ...(canManageTeam ? {} : { ownerUserId: actor.userId }),
    },
  });
  if (!deal) throw new CrmError("Deal not found or not assigned to you.");
  const stage = await db.dealStage.findFirst({
    where: {
      id: input.stageId,
      organizationId: actor.organizationId,
      active: true,
    },
  });
  if (!stage) throw new CrmError("Choose an active stage.");
  if (deal.status === input.status && deal.stageId === stage.id) return;
  if (
    (input.status === "LOST" ||
      (deal.status !== "OPEN" && input.status === "OPEN")) &&
    !input.note
  )
    throw new CrmError(
      "Explain the loss or reopening for the account history.",
    );
  const saved = await db.deal.updateMany({
    where: {
      id: deal.id,
      organizationId: actor.organizationId,
      version: input.version,
    },
    data: {
      stageId: stage.id,
      status: input.status,
      probability: stage.probability,
      version: { increment: 1 },
    },
  });
  if (!saved.count)
    throw new CrmError("This deal changed. Refresh before moving it.");
  await db.dealEvent.create({
    data: {
      organizationId: actor.organizationId,
      dealId: deal.id,
      actorUserId: actor.userId,
      fromStageId: deal.stageId,
      toStageId: stage.id,
      fromStatus: deal.status,
      toStatus: input.status,
      note: input.note || null,
    },
  });
}
export function dealForecast(
  deals: { status: string; revenueCents: number | null; probability: number }[],
) {
  const open = deals.filter((d) => d.status === "OPEN");
  const valued = open.filter((d) => d.revenueCents !== null);
  return {
    openCount: open.length,
    unvalued: open.length - valued.length,
    totalCents: valued.reduce((s, d) => s + d.revenueCents!, 0),
    weightedCents: valued.reduce(
      (s, d) => s + Math.round((d.revenueCents! * d.probability) / 100),
      0,
    ),
  };
}
