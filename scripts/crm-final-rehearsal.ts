import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { reconcileMailSnapshot } from "../lib/crm/mail/sync";
import { loadAssistantEvidence } from "../lib/crm/aiEvidence";
import { saveSalesPlan, readSalesPlan } from "../lib/crm/pipeline";
import { beverageStages } from "../lib/crm/pipelineStages";
import { operationsReport } from "../lib/crm/operationsReport";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal required.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    actor = { organizationId: f.orgA, userId: f.userA };
  const priorFixtures=await prisma.mailboxConnection.findMany({where:{organizationId:f.orgA,provider:{startsWith:'FIXTURE_'}},select:{id:true}});
  await prisma.accountActivity.deleteMany({where:{organizationId:f.orgA,connectionId:{in:priorFixtures.map(c=>c.id)}}});
  await prisma.mailboxConnection.deleteMany({where:{organizationId:f.orgA,id:{in:priorFixtures.map(c=>c.id)}}});
  const c = await prisma.mailboxConnection.create({
    data: {
      organizationId: f.orgA,
      userId: f.userA,
      provider: `FIXTURE_${randomUUID()}`,
      email: "fixture@example.invalid",
      providerAccountId: randomUUID(),
      scope: "fixture",
    },
  });
  const base = {
    organizationId: f.orgA,
    createdByUserId: f.userA,
    activityType: "EMAIL" as const,
    connectionId: c.id,
    agencyId: f.account.accountId,
    visibility: "PRIVATE",
    summary: "Reconciliation fixture",
  };
  const [gone, seen, old, peer] = await Promise.all([
    prisma.accountActivity.create({
      data: {
        ...base,
        occurredAt: new Date("2026-10-02"),
        providerSeenAt: new Date("2026-10-01"),
      },
    }),
    prisma.accountActivity.create({
      data: {
        ...base,
        occurredAt: new Date("2026-10-02"),
        providerSeenAt: new Date("2026-10-11"),
      },
    }),
    prisma.accountActivity.create({
      data: { ...base, occurredAt: new Date("2026-08-02") },
    }),
    prisma.accountActivity.create({
      data: {
        ...base,
        organizationId: f.orgB,
        createdByUserId: f.userB,
        connectionId: null,
        summary: "Foreign confidential",
      },
    }),
  ]);
  const snapshot = {
    kind: "EMAIL" as const,
    startedAt: "2026-10-10T00:00:00Z",
    from: "2026-09-01T00:00:00Z",
    complete: false,
  };
  assert.equal(await reconcileMailSnapshot(prisma, f.orgA, c.id, snapshot), 0);
  assert.equal(
    await reconcileMailSnapshot(prisma, f.orgA, c.id, {
      ...snapshot,
      complete: true,
    }),
    1,
  );
  assert.equal(
    await prisma.accountActivity.findUnique({ where: { id: gone.id } }),
    null,
  );
  for (const id of [seen.id, old.id, peer.id])
    assert.ok(await prisma.accountActivity.findUnique({ where: { id } }));
  const publicEvidence = await loadAssistantEvidence(
      prisma,
      actor,
      f.account,
      false,
    ),
    privateEvidence = await loadAssistantEvidence(
      prisma,
      actor,
      f.account,
      true,
    );
  assert.ok(
    !publicEvidence.evidence.some((e) => e.id === `activity:${seen.id}`),
  );
  assert.ok(
    privateEvidence.evidence.some((e) => e.id === `activity:${seen.id}`),
  );
  assert.ok(
    !privateEvidence.evidence.some((e) => e.id === `activity:${peer.id}`),
  );
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: f.orgA },
  });
  await prisma.organization.update({
    where: { id: f.orgA },
    data: {
      crmPreferences: {
        ...(org.crmPreferences as object),
        pipelineStages: { version: 1, stages: beverageStages },
      },
    },
  });
  const key = {
    organizationId: f.orgA,
    accountType: "AGENCY" as const,
    externalAccountId: f.account.accountId,
  };
  let overlay = await prisma.organizationAccountOverlay.findUniqueOrThrow({
    where: { organizationId_accountType_externalAccountId: key },
  });
  await prisma.$transaction((db) =>
    saveSalesPlan(db, actor, {
      ...f.account,
      ...readSalesPlan(overlay.salesPlan),
      stageKey: "discovery",
      version: overlay.salesPlanVersion,
    }),
  );
  await prisma.organizationAccountOverlay.update({
    where: { organizationId_accountType_externalAccountId: key },
    data: { salesStatus: "LOST" },
  });
  overlay = await prisma.organizationAccountOverlay.findUniqueOrThrow({
    where: { organizationId_accountType_externalAccountId: key },
  });
  await prisma.$transaction((db) =>
    saveSalesPlan(db, actor, {
      ...f.account,
      ...readSalesPlan(overlay.salesPlan),
      stageKey: "discovery",
      version: overlay.salesPlanVersion,
    }),
  );
  assert.equal(
    (
      await prisma.organizationAccountOverlay.findUniqueOrThrow({
        where: { organizationId_accountType_externalAccountId: key },
      })
    ).salesStatus,
    "ENGAGED",
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveSalesPlan(db, actor, {
        ...f.account,
        stageKey: "discovery",
        version: overlay.salesPlanVersion,
      }),
    ),
  );
  const report = await operationsReport(
    prisma,
    f.orgA,
    "2026-09-01",
    "2026-10-11",
  );
  assert.equal(report.organizationId, f.orgA);
  await prisma.accountActivity.deleteMany({where:{id:{in:[seen.id,old.id,peer.id]},organizationId:{in:[f.orgA,f.orgB]}}});
  await prisma.mailboxConnection.deleteMany({where:{id:c.id,organizationId:f.orgA}});
  console.log(
    "PASS complete-rescan absence cleanup, retained/outside/foreign preservation, AI private and cross-tenant retrieval, canonical Pipeline reopening and stale saves, operational report.",
  );
}
main().finally(() => prisma.$disconnect());
