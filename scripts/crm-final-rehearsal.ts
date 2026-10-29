import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma, runWithOrganizationStateAccess } from "../lib/prisma";
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
  const taskWhere = {
    organizationId: f.orgA,
    agencyId: f.account.accountId,
    status: { in: ["OPEN", "IN_PROGRESS"] as ("OPEN" | "IN_PROGRESS")[] },
  };
  const expectedTasks = await prisma.worklistItem.count({ where: taskWhere });
  assert.ok(expectedTasks > 0);
  assert.equal(
    await runWithOrganizationStateAccess(f.orgA, () =>
      prisma.worklistItem.count({ where: taskWhere }),
    ),
    expectedTasks,
  );
  const report = await operationsReport(
    prisma,
    f.orgA,
    "2026-09-01",
    "2026-10-11",
  );
  assert.equal(report.organizationId, f.orgA);
  console.log(
    "PASS canonical Pipeline reopening and stale saves, operational report.",
  );
}
main().finally(() => prisma.$disconnect());
