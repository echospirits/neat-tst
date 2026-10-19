import { z } from "zod";
import { type Prisma, type User } from "@prisma/client";
import {
  accountInput,
  accountWhere,
  assertAccount,
  CrmError,
  type CrmActor,
  type CrmDb,
} from "./activity";
import { createAccountFollowUp } from "../contextualFollowUp";
export const playbookStep = z.object({
  title: z.string().trim().min(1).max(180),
  day: z.coerce.number().int().min(0).max(365),
  detail: z.string().trim().max(2000).default(""),
});
export const playbookInput = z.object({
  id: z.string().max(100).optional(),
  version: z.coerce.number().int().min(0),
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  steps: z.array(playbookStep).min(1).max(12),
});
export const defaultPlaybooks = [
  {
    name: "New account introduction",
    steps: [
      { title: "Research account and confirm buyer", day: 0 },
      { title: "Make a personal introduction", day: 1 },
      { title: "Follow up on introduction", day: 7 },
      { title: "Review samples and next step", day: 14 },
    ],
  },
  {
    name: "Lapsed account recovery",
    steps: [
      { title: "Review purchase history and buyer", day: 0 },
      { title: "Ask about the change in purchasing", day: 1 },
      { title: "Agree a recovery next step", day: 7 },
    ],
  },
  {
    name: "Menu placement",
    steps: [
      { title: "Review menu and choose a recipe", day: 0 },
      { title: "Arrange a sample and tasting", day: 3 },
      { title: "Confirm menu placement evidence", day: 14 },
    ],
  },
].map((p) => ({ ...p, steps: p.steps.map((s) => ({ ...s, detail: "" })) }));
export async function savePlaybook(db: CrmDb, actor: CrmActor, raw: unknown) {
  const input = playbookInput.parse(raw);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`playbook-settings:${actor.organizationId}`}, 0))`;
  const old = input.id
    ? await db.salesPlaybook.findFirst({
        where: { id: input.id, organizationId: actor.organizationId },
      })
    : null;
  if (input.id && (!old || old.version !== input.version))
    throw new CrmError("This playbook changed. Reload before saving.");
  const data = { name: input.name, active: input.active, steps: input.steps };
  const result = old
    ? await db.salesPlaybook.update({
        where: { id: old.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await db.salesPlaybook.create({
        data: { ...data, organizationId: actor.organizationId },
      });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "PLAYBOOK_SAVED",
        id: result.id,
        before: old?.steps ?? [],
        after: input.steps,
        version: result.version,
      },
    },
  });
  return result;
}
const startInput = accountInput.extend({
  playbookId: z.string().min(1).max(100),
  submissionKey: z.string().uuid(),
  assignedToUserId: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export async function startPlaybook(
  db: CrmDb,
  actor: CrmActor,
  user: Pick<User, "id" | "name" | "email">,
  raw: unknown,
) {
  const input = startInput.parse(raw);
  await assertAccount(db, input);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`playbook:${actor.organizationId}:${input.accountType}:${input.accountId}:${input.playbookId}`}, 0))`;
  const previous = await db.playbookRun.findUnique({
    where: {
      organizationId_submissionKey: {
        organizationId: actor.organizationId,
        submissionKey: input.submissionKey,
      },
    },
    include: { tasks: { select: { id: true } } },
  });
  if (previous)
    return {
      runId: previous.id,
      taskIds: previous.tasks.map((t) => t.id),
      replay: true,
    };
  const active = await db.playbookRun.findFirst({
    where: {
      organizationId: actor.organizationId,
      accountType: input.accountType,
      accountId: input.accountId,
      playbookId: input.playbookId,
      status: "ACTIVE",
    },
    include: { tasks: { select: { id: true, status: true } } },
  });
  if (
    active?.tasks.some((t) => t.status === "OPEN" || t.status === "IN_PROGRESS")
  )
    return {
      runId: active.id,
      taskIds: active.tasks.map((t) => t.id),
      replay: true,
    };
  if (active)
    await db.playbookRun.update({
      where: { id: active.id },
      data: { status: "COMPLETED", endedAt: new Date() },
    });
  const template = await db.salesPlaybook.findFirst({
    where: {
      id: input.playbookId,
      organizationId: actor.organizationId,
      active: true,
    },
  });
  if (!template)
    throw new CrmError("Choose an active playbook for this organization.");
  const steps = z.array(playbookStep).min(1).max(12).parse(template.steps);
  const start = new Date(`${input.startDate}T12:00:00.000Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    start.toISOString().slice(0, 10) !== input.startDate
  )
    throw new CrmError("Choose a valid start date.");
  const run = await db.playbookRun.create({
    data: {
      organizationId: actor.organizationId,
      playbookId: template.id,
      accountType: input.accountType,
      accountId: input.accountId,
      submissionKey: input.submissionKey,
      startedByUserId: actor.userId,
      snapshot: { name: template.name, version: template.version, steps },
    },
  });
  const taskIds: string[] = [];
  for (const [index, step] of steps.entries()) {
    const dueDate = new Date(start);
    dueDate.setUTCDate(dueDate.getUTCDate() + step.day);
    const item = await createAccountFollowUp(db, {
      organizationId: actor.organizationId,
      user,
      context: accountWhere(input),
      title: step.title,
      note: step.detail || null,
      submissionKey: `playbook:${run.id}:${index}`,
      assignedToUserId: input.assignedToUserId,
      dueDate,
      playbookRunId: run.id,
    });
    taskIds.push(item.id);
  }
  // Save task versions after creation so cancellation never discards someone's later edits.
  const versions = await db.worklistItem.findMany({
    where: { organizationId: actor.organizationId, playbookRunId: run.id },
    select: { id: true, updatedAt: true },
  });
  await db.playbookRun.update({
    where: { id: run.id },
    data: {
      snapshot: {
        name: template.name,
        version: template.version,
        steps,
        taskVersions: Object.fromEntries(
          versions.map((t) => [t.id, t.updatedAt.toISOString()]),
        ),
      },
    },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: { kind: "PLAYBOOK_STARTED", runId: run.id, taskIds },
    },
  });
  return { runId: run.id, taskIds, replay: false };
}
export async function cancelPlaybook(
  db: CrmDb,
  actor: CrmActor,
  runId: string,
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`playbook-cancel:${actor.organizationId}:${runId}`}, 0))`;
  const run = await db.playbookRun.findFirst({
    where: { id: runId, organizationId: actor.organizationId },
    include: { tasks: true },
  });
  if (!run) throw new CrmError("Playbook not found.");
  if (run.status !== "ACTIVE") return { taskIds: [], skipped: 0 };
  const versions = (run.snapshot as Prisma.JsonObject).taskVersions as
    Record<string, string> | undefined;
  const taskIds: string[] = [];
  let skipped = 0;
  for (const task of run.tasks) {
    if (!["OPEN", "IN_PROGRESS"].includes(task.status)) continue;
    const expected = versions?.[task.id];
    if (
      !expected ||
      task.status !== "OPEN" ||
      task.updatedAt.toISOString() !== expected
    ) {
      skipped++;
      continue;
    }
    const result = await db.worklistItem.updateMany({
      where: {
        id: task.id,
        organizationId: actor.organizationId,
        status: "OPEN",
        updatedAt: new Date(expected),
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: actor.userId,
      },
    });
    if (result.count) taskIds.push(task.id);
    else skipped++;
  }
  await db.playbookRun.update({
    where: { id: run.id },
    data: { status: "CANCELLED", endedAt: new Date() },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: { kind: "PLAYBOOK_CANCELLED", runId, taskIds, skipped },
    },
  });
  return { taskIds, skipped };
}
