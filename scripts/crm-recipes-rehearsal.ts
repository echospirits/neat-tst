import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { saveRecipe, approveRecipe, shareRecipe } from "../lib/crm/recipes";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal" ||
  process.env.APP_ENV !== "development"
)
  throw Error("Isolated rehearsal required.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    actor = { organizationId: f.orgA, userId: f.userA },
    other = { organizationId: f.orgB, userId: f.userB };
  const input = {
    version: 0,
    name: `Recipe QA ${randomUUID()}`,
    primarySpirit: "Tenant spirit",
    recipeText: "2 oz spirit\n1 oz mixer",
    instructions: "Stir with ice.",
    garnish: "Citrus",
    glassware: "Rocks",
    flavorProfile: "Bright",
    season: "Autumn",
    sourceAttribution: "Synthetic recipe",
    costing: {
      menuPrice: 12,
      targetMargin: 75,
      wastePercent: 10,
      portions: 1,
      lines: [{ name: "Spirit", cost: 2 }],
    },
  };
  const recipe = await prisma.$transaction((db) =>
    saveRecipe(db, actor, input),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) => shareRecipe(db, actor, recipe.id)),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      approveRecipe(db, other, recipe.id, recipe.version),
    ),
  );
  await prisma.$transaction((db) =>
    approveRecipe(db, actor, recipe.id, recipe.version),
  );
  const token = await prisma.$transaction((db) =>
      shareRecipe(db, actor, recipe.id),
    ),
    share = await prisma.recipeShare.findUniqueOrThrow({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    });
  assert.equal(share.organizationId, f.orgA);
  assert.ok(!("costing" in (share.snapshot as object)));
  assert.ok(!("organizationId" in (share.snapshot as object)));
  assert.ok(share.expiresAt.getTime() > Date.now());
  await assert.rejects(() =>
    prisma.$transaction((db) => shareRecipe(db, other, recipe.id)),
  );
  await prisma.$transaction((db) =>
    saveRecipe(db, actor, {
      ...input,
      id: recipe.id,
      version: recipe.version,
      name: "Revised recipe",
    }),
  );
  assert.ok(
    (await prisma.recipeShare.findUniqueOrThrow({ where: { id: share.id } }))
      .revokedAt,
  );
  await assert.rejects(() =>
    prisma.$transaction((db) => shareRecipe(db, actor, recipe.id)),
  );
  await assert.rejects(() =>
    prisma.$transaction((db) =>
      saveRecipe(db, actor, {
        ...input,
        id: recipe.id,
        version: recipe.version,
      }),
    ),
  );
  console.log(
    "PASS recipes: tenant isolation, approval, safe public snapshot, expiry, edit revocation and stale-version rejection.",
  );
}
main().finally(() => prisma.$disconnect());
