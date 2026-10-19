import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  assertAccount,
  accountInput,
  CrmError,
  type CrmActor,
  type CrmDb,
} from "./activity";
import {
  accountConfigurationInput,
  readAccountConfiguration,
  accountKinds,
  validateCustomValues,
} from "./accountConfiguration";
export async function saveAccountConfiguration(
  db: CrmDb,
  actor: CrmActor,
  raw: unknown,
) {
  const input = accountConfigurationInput.parse(raw);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${actor.organizationId}`},0))`;
  const org = await db.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { crmPreferences: true },
    }),
    old = readAccountConfiguration(org.crmPreferences);
  if (input.version !== old.version)
    throw new CrmError("Settings changed. Reload before saving.");
  const userIds = [
    ...new Set([
      ...input.teams.flatMap((t) => t.memberIds),
      ...input.territories.map((t) => t.ownerUserId).filter(Boolean),
    ]),
  ];
  if (
    (await db.user.count({
      where: {
        id: { in: userIds },
        organizationId: actor.organizationId,
        isActive: true,
        role: { not: "PLATFORM_ADMIN" },
      },
    })) !== userIds.length
  )
    throw new CrmError("Choose active members of this organization.");
  for (const [id, key] of [
    ...old.territories
      .filter((t) => !input.territories.some((n) => n.id === t.id))
      .map((t) => [t.id, "territoryId"]),
    ...old.categories
      .filter((t) => !input.categories.some((n) => n.id === t.id))
      .map((t) => [t.id, "kind"]),
    ...old.teams
      .filter((t) => !input.teams.some((n) => n.id === t.id))
      .map((t) => [t.id, "teamId"]),
  ]) {
    if (
      await db.organizationAccountOverlay.count({
        where: {
          organizationId: actor.organizationId,
          crmDetails: { path: [key], equals: id },
        },
      })
    )
      throw new CrmError(
        "Reassign accounts before removing their territory or team.",
      );
  }
  await db.organization.update({
    where: { id: actor.organizationId },
    data: {
      crmPreferences: {
        ...(org.crmPreferences as Prisma.JsonObject),
        accountConfiguration: { ...input, version: old.version + 1 },
      } as Prisma.InputJsonValue,
    },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: { kind: "ACCOUNT_CONFIGURATION", before: old, after: input },
    },
  });
}
export const metadataInput = accountInput.extend({
  version: z.coerce.number().int().min(0),
  configurationVersion: z.coerce.number().int().min(0),
  kind: z.string().max(100).nullable(),
  territoryId: z.string().max(100).default(""),
  teamId: z.string().max(100).default(""),
  parent: z
    .object({
      accountType: z.enum(["AGENCY", "WHOLESALE"]),
      accountId: z.string().min(1).max(100),
    })
    .nullable(),
  documents: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        url: z
          .string()
          .url()
          .max(2000)
          .refine((v) => {
            const u = new URL(v);
            return u.protocol === "https:" && !u.username && !u.password;
          }, "Use an HTTPS document link without embedded credentials."),
      }),
    )
    .max(20)
    .default([]),
  custom: z.record(z.string(), z.unknown()),
});
export async function saveAccountMetadata(
  db: CrmDb,
  actor: CrmActor,
  raw: unknown,
) {
  const input = metadataInput.parse(raw);
  await assertAccount(db, input);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${actor.organizationId}`},0))`;
  const org = await db.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { crmPreferences: true },
    }),
    config = readAccountConfiguration(org.crmPreferences);
  if (input.configurationVersion !== config.version)
    throw new CrmError("Account fields changed. Reload before saving.");
  if (
    input.kind &&
    !accountKinds.includes(input.kind as (typeof accountKinds)[number]) &&
    !config.categories.some((c) => c.id === input.kind)
  )
    throw new CrmError("Choose an available account category.");
  if (
    (input.territoryId &&
      !config.territories.some((t) => t.id === input.territoryId)) ||
    (input.teamId && !config.teams.some((t) => t.id === input.teamId))
  )
    throw new CrmError("Choose an available territory and team.");
  if (input.parent) {
    await assertAccount(db, input.parent);
    let parent: {
      accountType: "AGENCY" | "WHOLESALE";
      accountId: string;
    } | null = input.parent;
    const seen = new Set([`${input.accountType}:${input.accountId}`]);
    while (parent) {
      const key = `${parent.accountType}:${parent.accountId}`;
      if (seen.has(key) || seen.size > 25)
        throw new CrmError(
          "Parent accounts cannot create a cycle or exceed 25 levels.",
        );
      seen.add(key);
      const row: { crmDetails: Prisma.JsonValue } | null =
        await db.organizationAccountOverlay.findUnique({
          where: {
            organizationId_accountType_externalAccountId: {
              organizationId: actor.organizationId,
              accountType: parent.accountType,
              externalAccountId: parent.accountId,
            },
          },
          select: { crmDetails: true },
        });
      parent =
        (row?.crmDetails as { parent?: typeof input.parent })?.parent ?? null;
    }
  }
  const key = {
    organizationId: actor.organizationId,
    accountType: input.accountType,
    externalAccountId: input.accountId,
  };
  const old = await db.organizationAccountOverlay.findUnique({
    where: { organizationId_accountType_externalAccountId: key },
  });
  if ((old?.crmDetailsVersion ?? 0) !== input.version)
    throw new CrmError("Account profile changed. Reload before saving.");
  let custom;
  try {
    custom = validateCustomValues(config, input.custom);
  } catch (e) {
    throw new CrmError((e as Error).message);
  }
  const data = {
    documents: input.documents,
    kind: input.kind,
    territoryId: input.territoryId,
    teamId: input.teamId,
    parent: input.parent,
    custom: {
      ...((
        old?.crmDetails as { custom?: Record<string, Prisma.InputJsonValue> }
      )?.custom ?? {}),
      ...custom,
    },
  };
  await db.organizationAccountOverlay.upsert({
    where: { organizationId_accountType_externalAccountId: key },
    create: { ...key, crmDetails: data, crmDetailsVersion: 1 },
    update: { crmDetails: data, crmDetailsVersion: { increment: 1 } },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "ACCOUNT_PROFILE",
        account: input.accountId,
        before: old?.crmDetails ?? {},
        after: data,
      },
    },
  });
}
