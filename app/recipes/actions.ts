"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError } from "../../lib/crm/activity";
import { saveRecipe, approveRecipe, shareRecipe } from "../../lib/crm/recipes";
import type { CrmActionResult } from "../crm/actions";
async function act(
  callback: () => Promise<CrmActionResult>,
): Promise<CrmActionResult> {
  try {
    return await callback();
  } catch (e) {
    if (e instanceof CrmError) return { error: e.message };
    if (e instanceof z.ZodError)
      return { error: "Check the recipe, ingredients, and costing values." };
    throw e;
  }
}
export async function saveRecipeAction(form: FormData) {
  return act(async () => {
    const { actor } = await requireCrmActor();
    const names = form.getAll("costName"),
      costs = form.getAll("costValue");
    const recipe = await prisma.$transaction((db) =>
      saveRecipe(db, actor, {
        ...Object.fromEntries(form),
        id: String(form.get("id") || "") || undefined,
        costing: {
          menuPrice: form.get("menuPrice"),
          targetMargin: form.get("targetMargin"),
          wastePercent: form.get("wastePercent"),
          portions: form.get("portions"),
          lines: names.map((name, i) => ({ name, cost: costs[i] })),
        },
      }),
    );
    revalidatePath("/recipes");
    return {
      success: "Recipe saved. Edited recipes need approval before sharing.",
      href: `/recipes/${recipe.id}`,
    };
  });
}
export async function approveRecipeAction(form: FormData) {
  return act(async () => {
    const { actor, user } = await requireCrmActor();
    if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
      return { error: "An administrator must approve public materials." };
    const id = String(form.get("id"));
    await prisma.$transaction((db) =>
      approveRecipe(db, actor, id, Number(form.get("version"))),
    );
    revalidatePath(`/recipes/${id}`);
    return { success: "Recipe approved for sharing." };
  });
}
export async function shareRecipeAction(form: FormData) {
  return act(async () => {
    const { actor } = await requireCrmActor();
    const token = await prisma.$transaction((db) =>
      shareRecipe(db, actor, String(form.get("id"))),
    );
    return {
      success:
        "This approved sheet expires in 30 days. Share its link or print it.",
      href: `/shared/recipes/${token}`,
    };
  });
}
export async function revokeRecipeShares(form: FormData) {
  return act(async () => {
    const { actor, user } = await requireCrmActor();
    if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
      return { error: "An administrator must revoke public materials." };
    const id = String(form.get("id"));
    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`recipe:${actor.organizationId}:${id}`},0))`;
      await db.recipeShare.updateMany({
        where: {
          organizationId: actor.organizationId,
          recipeId: id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await db.organizationAuditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          metadata: { kind: "RECIPE_SHARES_REVOKED", recipeId: id },
        },
      });
    });
    return { success: "All public links for this recipe were revoked." };
  });
}
export async function suggestRecipeAction(form: FormData) {
  return act(async () => {
    const { actor } = await requireCrmActor();
    const id = String(form.get("id")),
      accountId = String(form.get("accountId"));
    const [recipe, account] = await Promise.all([
      prisma.recipe.findFirst({
        where: { id, organizationId: actor.organizationId },
      }),
      prisma.wholesaleAccount.findFirst({
        where: { id: accountId, mergedIntoId: null },
      }),
    ]);
    if (!recipe || !account)
      return { error: "Choose an available recipe and account." };
    await prisma.recipeSuggestion.upsert({
      where: {
        organizationId_recipeId_wholesaleAccountId: {
          organizationId: actor.organizationId,
          recipeId: id,
          wholesaleAccountId: accountId,
        },
      },
      create: {
        organizationId: actor.organizationId,
        recipeId: id,
        wholesaleAccountId: accountId,
        createdByUserId: actor.userId,
        note: String(form.get("note") || "").slice(0, 2000),
      },
      update: {
        note: String(form.get("note") || "").slice(0, 2000),
        suggestedAt: new Date(),
      },
    });
    revalidatePath(`/wholesale/${accountId}`);
    return { success: "Recipe saved to this account." };
  });
}
