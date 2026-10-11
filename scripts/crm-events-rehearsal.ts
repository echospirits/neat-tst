import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { saveEvent, eventSalesComparison } from "../lib/crm/events";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal required.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    actor = { organizationId: f.orgA, userId: f.userA };
  const input = {
    submissionKey: randomUUID(),
    version: 0,
    title: "Event rehearsal",
    startsAt: new Date(Date.now() + Math.random() * 100 * 86400000),
    endsAt: new Date(),
    location: "Fixture",
    accountType: f.account.accountType,
    accountId: f.account.accountId,
    staffUserIds: [f.userA],
    eventType: "TASTING",
    status: "open",
    attendance: null,
    details: {
      products: "Fixture spirit",
      samples: 20,
      cost: 50,
      outcomes: "",
      photoLinks: "",
      windowDays: 30,
      comparison: "PREVIOUS_PERIOD",
    },
  };
  input.endsAt = new Date(input.startsAt.getTime() + 3600000);
  const a = await prisma.$transaction((db) => saveEvent(db, actor, input));
  assert.equal(
    (await prisma.$transaction((db) => saveEvent(db, actor, input))).id,
    a.id,
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveEvent(db, actor, { ...input, submissionKey: randomUUID() }),
    ),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveEvent(
        db,
        { organizationId: f.orgB, userId: f.userB },
        { ...input, id: a.id, version: a.version },
      ),
    ),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveEvent(db, actor, {
        ...input,
        id: a.id,
        version: a.version,
        staffUserIds: [f.userB],
      }),
    ),
  );
  await prisma.$transaction((db) =>
    saveEvent(db, actor, {
      ...input,
      id: a.id,
      version: a.version,
      status: "completed",
    }),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveEvent(db, actor, { ...input, id: a.id, version: a.version }),
    ),
  );
  const comparison = await eventSalesComparison(prisma, f.orgA, {
    ...a,
    accountType: "WHOLESALE",
    externalAccountId: "missing",
  });
  assert.equal(comparison.before?.bottles, null);
  assert.equal(comparison.after?.bottles, null);
  console.log(
    "PASS events: tenant/staff isolation, retry safety, conflicting shifts, stale versions and missing sales coverage.",
  );
}
main().finally(() => prisma.$disconnect());
