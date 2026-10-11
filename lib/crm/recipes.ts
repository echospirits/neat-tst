import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { CrmError, type CrmActor, type CrmDb } from "./activity";
import { recipeCostingInput } from "./recipeCosting";
export { recipeCosts } from "./recipeCosting";
export const recipeInput = z.object({
  id: z.string().max(100).optional(),
  version: z.coerce.number().int().min(0),
  name: z.string().trim().min(1).max(160),
  primarySpirit: z.string().trim().max(200),
  recipeText: z.string().trim().min(1).max(6000),
  instructions: z.string().trim().max(6000),
  garnish: z.string().trim().max(300),
  glassware: z.string().trim().max(200),
  flavorProfile: z.string().trim().max(300),
  season: z.string().trim().max(100),
  sourceAttribution: z.string().trim().max(500),
  costing: recipeCostingInput,
});
export async function saveRecipe(db: CrmDb, actor: CrmActor, raw: unknown) {
  const { id, version, ...input } = recipeInput.parse(raw);
  if (id)
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe:${actor.organizationId}:${id}`},0))`;
  const old = id
    ? await db.recipe.findFirst({
        where: { id, organizationId: actor.organizationId },
      })
    : null;
  if (id && (!old || old.version !== version))
    throw new CrmError("Recipe changed. Reload before saving.");
  const data = {
    ...input,
    ingredients: input.recipeText.split("\n").map((text) => ({ text })),
    updatedByUserId: actor.userId,
    approvedAt: null,
    approvedByUserId: null,
  };
  const recipe = old
    ? await db.recipe.update({
        where: { id: old.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await db.recipe.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          createdByUserId: actor.userId,
        },
      });
  // Changing approved content invalidates every public sheet, including immutable snapshots.
  await db.recipeShare.updateMany({
    where: {
      organizationId: actor.organizationId,
      recipeId: recipe.id,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "RECIPE_SAVED",
        recipeId: recipe.id,
        version: recipe.version,
      },
    },
  });
  return recipe;
}
export async function approveRecipe(
  db: CrmDb,
  actor: CrmActor,
  id: string,
  version: number,
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe:${actor.organizationId}:${id}`},0))`;
  const changed = await db.recipe.updateMany({
    where: { id, organizationId: actor.organizationId, version },
    data: { approvedAt: new Date(), approvedByUserId: actor.userId },
  });
  if (!changed.count)
    throw new CrmError(
      "Recipe changed. Reload and review it before approving.",
    );
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: { kind: "RECIPE_APPROVED", recipeId: id, version },
    },
  });
}
export async function shareRecipe(db: CrmDb, actor: CrmActor, id: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe:${actor.organizationId}:${id}`},0))`;
  const recipe = await db.recipe.findFirst({
    where: {
      id,
      organizationId: actor.organizationId,
      approvedAt: { not: null },
    },
    include: {
      organization: { select: { displayName: true, brandPrimaryColor: true } },
    },
  });
  if (!recipe)
    throw new CrmError(
      "An administrator must approve this recipe before sharing.",
    );
  const token = randomBytes(32).toString("base64url");
  const snapshot = {
    name: recipe.name,
    brand: recipe.organization.displayName,
    color: recipe.organization.brandPrimaryColor,
    primarySpirit: recipe.primarySpirit,
    recipeText: recipe.recipeText,
    instructions: recipe.instructions,
    garnish: recipe.garnish,
    glassware: recipe.glassware,
    flavorProfile: recipe.flavorProfile,
    sourceAttribution: recipe.sourceAttribution,
    version: recipe.version,
  };
  await db.recipeShare.create({
    data: {
      organizationId: actor.organizationId,
      recipeId: id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      snapshot,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdByUserId: actor.userId,
    },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "RECIPE_SHARED",
        recipeId: id,
        version: recipe.version,
        expiresDays: 30,
      },
    },
  });
  return token;
}
