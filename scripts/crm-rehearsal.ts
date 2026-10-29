import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  logActivity,
  correctActivity,
  readTimeline,
} from "../lib/crm/activity";
import { saveSalesPlan } from "../lib/crm/pipeline";
import { setAccountSalesStatus } from "../lib/accountSalesStatus";
import { relateContacts } from "../lib/crm/contacts";
import { getAccountBriefing } from "../lib/crm/briefing";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal environment required.");
const db = new PrismaClient();
async function main() {
  const run = randomUUID().slice(0, 8),
    orgA = `crm_qa_a_${run}`,
    orgB = `crm_qa_b_${run}`,
    userA = `crm_qa_rep_${run}`,
    userB = `crm_qa_other_${run}`,
    colleague = `crm_qa_colleague_${run}`;
  for (const [id, slug] of [
    [orgA, `qa-a-${run}`],
    [orgB, `qa-b-${run}`],
  ])
    await db.organization.create({
      data: {
        id,
        slug,
        name: "CRM isolated acceptance fixture",
        displayName: "CRM acceptance",
        active: true,
      },
    });
  for (const [id, organizationId, role] of [
    [userA, orgA, "ADMIN"],
    [userB, orgB, "USER"],
    [colleague, orgA, "USER"],
  ] as const)
    await db.user.create({
      data: {
        id,
        organizationId,
        email: `${id}@example.invalid`,
        role,
        isActive: true,
        name: id === userA ? "QA Representative" : "Other fixture user",
      },
    });
  await db.organizationFeature.createMany({
    data: [
      "CORE_CRM",
      "VISITS",
      "WORKLIST",
      "AGENCIES",
      "WHOLESALE_ACCOUNTS",
      "ACCOUNT_SALES_STATUS",
    ].flatMap((featureKey) =>
      [orgA, orgB].map((organizationId) => ({
        organizationId,
        featureKey,
        enabled: true,
      })),
    ),
  });
  const agency = await db.agency.findFirst({
    select: { id: true, name: true },
  });
  assert.ok(agency, "Rehearsal copy must contain a shared reference account");
  const account = { accountType: "AGENCY" as const, accountId: agency.id },
    actor = { organizationId: orgA, userId: userA },
    other = { organizationId: orgB, userId: userB },
    peer = { organizationId: orgA, userId: colleague };
  const aContact = await db.locationContact.create({
    data: {
      organizationId: orgA,
      agencyId: agency.id,
      name: "Fixture Buyer",
      email: "buyer@example.invalid",
    },
  });
  const bContact = await db.locationContact.create({
    data: {
      organizationId: orgB,
      agencyId: agency.id,
      name: "Other Tenant Buyer",
      email: "buyer@example.invalid",
    },
  });
  const manual = {
    ...account,
    activityType: "PHONE_CALL",
    summary: "Confirmed a sample presentation",
    occurredAt: new Date(),
    contactId: aContact.id,
    submissionKey: randomUUID(),
    visibility: "PRIVATE",
    meaningful: true,
  };
  const first = await db.$transaction((tx) => logActivity(tx, actor, manual));
  const replay = await db.$transaction((tx) => logActivity(tx, actor, manual));
  assert.equal(first.id, replay.id);
  await assert.rejects(() =>
    db.$transaction((tx) =>
      logActivity(tx, actor, {
        ...manual,
        contactId: bContact.id,
        submissionKey: randomUUID(),
      }),
    ),
  );
  assert.equal(
    (await readTimeline(db, peer, account)).entries.length,
    0,
    "same-tenant peer must not see private activity",
  );
  assert.equal(
    (await readTimeline(db, other, account)).entries.length,
    0,
    "other tenant must not see activity",
  );
  assert.equal((await readTimeline(db, actor, account)).entries.length, 1);
  await assert.rejects(() =>
    db.$transaction((tx) =>
      correctActivity(tx, peer, {
        ...account,
        id: first.id,
        visibility: "TEAM",
      }),
    ),
  );
  await db.$transaction((tx) =>
    correctActivity(tx, actor, {
      ...account,
      id: first.id,
      visibility: "TEAM",
      contactId: aContact.id,
    }),
  );
  assert.equal((await readTimeline(db, peer, account)).entries.length, 1);
  assert.equal(
    await db.activityAudit.count({
      where: { organizationId: orgA, activityId: first.id },
    }),
    1,
  );
  await db.$transaction(tx => setAccountSalesStatus({ db: tx, organizationId: orgA, accountType: 'AGENCY', externalAccountId: agency.id, status: 'CONTACTED', source: 'USER', changedByUserId: userA }));
  await db.$transaction(tx => saveSalesPlan(tx, actor, { ...account, version: 0, estimatedRevenue: 1250, probability: 30 }));
  await assert.rejects(() => db.$transaction(tx => saveSalesPlan(tx, actor, { ...account, version: 0, estimatedRevenue: 900 })));
  assert.equal(await db.organizationAccountOverlay.count({ where: { organizationId: orgB, externalAccountId: agency.id } }), 0);
  const briefing = await getAccountBriefing(db, actor, account);
  assert.equal(
    briefing.lastVisit,
    null,
    "phone and email must not become physical visits",
  );
  assert.ok(briefing.lastContact);
  const duplicate = await db.locationContact.create({ data: { organizationId: orgA, agencyId: agency.id, name: 'Duplicate buyer', email: 'alias@example.invalid' } });
  const duplicateActivity = await db.$transaction(tx => logActivity(tx, actor, { ...manual, contactId: duplicate.id, submissionKey: randomUUID() }));
  await assert.rejects(() => db.$transaction(tx => relateContacts(tx, other, { id: aContact.id, otherId: duplicate.id, operation: 'MERGE' })));
  await db.$transaction(tx => relateContacts(tx, actor, { id: aContact.id, otherId: duplicate.id, operation: 'MERGE' }));
  assert.equal((await db.locationContact.findUniqueOrThrow({ where: { id: duplicate.id } })).active, false);
  assert.equal((await db.accountActivity.findUniqueOrThrow({ where: { id: duplicateActivity.id } })).contactId, aContact.id);
  const merged = await db.locationContact.findUniqueOrThrow({ where: { id: aContact.id } });
  assert.ok(merged.emailAliases.includes('alias@example.invalid'));
  assert.ok(merged.personKey);
  // Browser acceptance uses only these synthetic users and their newly-created rows in this isolated branch.
  const token = randomBytes(32).toString("base64url");
  await db.userSession.create({
    data: {
      userId: userA,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/crm-rehearsal.json",
    JSON.stringify({
      orgA,
      orgB,
      userA,
      userB,
      colleague,
      account,
      accountName: agency.name,
      sessionToken: token,
    }),
  );
  console.log(
    "PASS: database persistence, replay, private visibility, tenant isolation, correction audit, canonical Pipeline and account-plan concurrency and visit semantics.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(
      "CRM database rehearsal failed. Inspect the failing assertion locally without logging private fixture content.",
    );
    // Stack frames identify the failed check without printing error messages or values.
    if (error instanceof Error)
      console.error(
        error.name,
        error.stack
          ?.split("\n")
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 5)
          .join("\n"),
      );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
