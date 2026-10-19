import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { readAccountConfiguration } from "../lib/crm/accountConfiguration";
import {
  saveAccountConfiguration,
  saveAccountMetadata,
} from "../lib/crm/accountMetadata";
import { getRouteStops, saveRouteOrder } from "../lib/crm/routes";
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
    }),
    old = readAccountConfiguration(org.crmPreferences),
    territoryId = randomUUID(),
    fieldId = randomUUID();
  const config = {
    version: old.version,
    teams: [],
    territories: [
      {
        id: territoryId,
        name: "Fixture territory",
        states: "OH",
        counties: "",
        postalCodes: "",
        ownerUserId: f.userA,
      },
    ],
    fields: [{ id: fieldId, name: "Fixture capacity", type: "NUMBER" }],
  };
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveAccountConfiguration(db, actor, {
        ...config,
        territories: [{ ...config.territories[0], ownerUserId: f.userB }],
      }),
    ),
  );
  await prisma.$transaction((db) =>
    saveAccountConfiguration(db, actor, config),
  );
  const overlay = await prisma.organizationAccountOverlay.findUnique({
    where: {
      organizationId_accountType_externalAccountId: {
        organizationId: f.orgA,
        accountType: f.account.accountType,
        externalAccountId: f.account.accountId,
      },
    },
  });
  const input = {
    ...f.account,
    version: overlay?.crmDetailsVersion ?? 0,
    configurationVersion: old.version + 1,
    kind: "LIQUOR_AGENCY",
    territoryId,
    teamId: "",
    parent: null,
    custom: { [fieldId]: "0" },
  };
  await prisma.$transaction((db) => saveAccountMetadata(db, actor, input));
  await assert.rejects(() =>
    prisma.$transaction((db) => saveAccountMetadata(db, actor, input)),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveAccountConfiguration(db, actor, {
        ...config,
        version: old.version + 1,
        territories: [],
      }),
    ),
  );
  const second = await prisma.agency.findFirstOrThrow({
    where: { id: { not: f.account.accountId } },
  });
  const secondOverlay = await prisma.organizationAccountOverlay.findUnique({
    where: {
      organizationId_accountType_externalAccountId: {
        organizationId: f.orgA,
        accountType: "AGENCY",
        externalAccountId: second.id,
      },
    },
  });
  await prisma.$transaction((db) =>
    saveAccountMetadata(db, actor, {
      ...input,
      accountId: second.id,
      version: secondOverlay?.crmDetailsVersion ?? 0,
      parent: f.account,
    }),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveAccountMetadata(db, actor, {
        ...input,
        version: input.version + 1,
        parent: { accountType: "AGENCY", accountId: second.id },
      }),
    ),
  );
  const task = await prisma.worklistItem.create({
    data: {
      organizationId: f.orgA,
      title: "Fixture route task",
      category: "AGENCY",
      agencyId: f.account.accountId,
      assignedToUserId: f.userA,
      createdByUserId: f.userA,
      dueDate: new Date("2026-11-25T12:00:00Z"),
    },
  });
  const route = await getRouteStops(prisma, actor, "2026-11-25");
  assert.ok(route.stops.some((s) => s.id === task.id));
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveRouteOrder(
        db,
        { organizationId: f.orgB, userId: f.userB },
        {
          date: "2026-11-25",
          stops: [{ id: task.id, version: task.updatedAt.toISOString() }],
        },
      ),
    ),
  );
  await prisma.$transaction((db) =>
    saveRouteOrder(db, actor, {
      date: "2026-11-25",
      stops: [{ id: task.id, version: task.updatedAt.toISOString() }],
    }),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveRouteOrder(db, actor, {
        date: "2026-11-25",
        stops: [{ id: task.id, version: task.updatedAt.toISOString() }],
      }),
    ),
  );
  console.log(
    "PASS account configuration/version/typed values/parent cycle and territory removal safeguards; route tenant, owner and stale-task guards.",
  );
}
main().finally(() => prisma.$disconnect());
