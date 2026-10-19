import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import {
  savePlaybook,
  startPlaybook,
  cancelPlaybook,
  defaultPlaybooks,
} from "../lib/crm/playbooks";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal required.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    actor = { organizationId: f.orgA, userId: f.userA };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: f.userA } });
  const contact = await prisma.locationContact.findFirstOrThrow({
    where: { organizationId: f.orgA, active: true },
  });
  const template = await prisma.$transaction((db) =>
    savePlaybook(db, actor, {
      ...defaultPlaybooks[0],
      name: `QA playbook ${randomUUID()}`,
      version: 0,
      active: true,
    }),
  );
  const input = {
    accountType: contact.agencyId ? "AGENCY" : "WHOLESALE",
    accountId: contact.agencyId ?? contact.wholesaleAccountId,
    playbookId: template.id,
    assignedToUserId: user.id,
    startDate: "2026-10-12",
    submissionKey: randomUUID(),
  };
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      startPlaybook(
        db,
        { organizationId: f.orgB, userId: f.userB },
        user,
        input,
      ),
    ),
  );
  const [a, b] = await Promise.all(
    [input, { ...input, submissionKey: randomUUID() }].map((i) =>
      prisma.$transaction((db) => startPlaybook(db, actor, user, i), {
        timeout: 30000,
      }),
    ),
  );
  assert.equal(a.runId, b.runId);
  assert.equal(a.taskIds.length, 4);
  assert.equal(
    await prisma.worklistItem.count({
      where: { organizationId: f.orgA, playbookRunId: a.runId },
    }),
    4,
  );
  await prisma.worklistItem.update({
    where: { id: a.taskIds[0] },
    data: { title: "Edited by a representative" },
  });
  await prisma.worklistItem.update({
    where: { id: a.taskIds[1] },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completedByUserId: user.id,
    },
  });
  await prisma.worklistItem.update({
    where: { id: a.taskIds[2] },
    data: { status: "IN_PROGRESS" },
  });
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      cancelPlaybook(db, { organizationId: f.orgB, userId: f.userB }, a.runId),
    ),
  );
  const cancelled = await prisma.$transaction((db) =>
    cancelPlaybook(db, actor, a.runId),
  );
  assert.equal(cancelled.taskIds.length, 1);
  assert.equal(cancelled.skipped, 2);
  const statuses = await prisma.worklistItem.findMany({
    where: { playbookRunId: a.runId },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    statuses.map((t) => t.status),
    ["OPEN", "COMPLETED", "IN_PROGRESS", "CANCELLED"],
  );
  assert.equal(
    (await prisma.$transaction((db) => cancelPlaybook(db, actor, a.runId)))
      .taskIds.length,
    0,
  );
  assert.equal(
    (await prisma.$transaction((db) => startPlaybook(db, actor, user, input)))
      .runId,
    a.runId,
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      savePlaybook(db, actor, {
        ...template,
        version: 0,
        steps: defaultPlaybooks[0].steps,
      }),
    ),
  );
  console.log(
    "PASS playbook tenant isolation, concurrent start deduplication, canonical Worklist creation, safe cancellation, retry and version checks.",
  );
}
main().finally(() => prisma.$disconnect());
