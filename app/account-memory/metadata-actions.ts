"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError } from "../../lib/crm/activity";
import {
  saveAccountConfiguration,
  saveAccountMetadata,
} from "../../lib/crm/accountMetadata";
import type { CrmActionResult } from "../../lib/crm/actionResult";
export async function saveAccountConfigurationAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
    return { error: "An administrator must edit account settings." };
  const raw = String(form.get("configuration") ?? "");
  if (raw.length > 100000)
    return { error: "Settings exceed the supported size." };
  try {
    await prisma.$transaction((db) =>
      saveAccountConfiguration(db, actor, JSON.parse(raw)),
    );
    revalidatePath("/admin/organization");
    return { success: "Territories, teams, and fields saved." };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : "Check names, field types, and team members. Names must be unique.",
    };
  }
}
export async function saveAccountMetadataAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor();
  try {
    const custom = Object.fromEntries(
      [...form]
        .filter(([key]) => key.startsWith("custom:"))
        .map(([key, value]) => [key.slice(7), value]),
    );
    await prisma.$transaction((db) =>
      saveAccountMetadata(db, actor, {
        ...Object.fromEntries(form),
        kind: form.get("kind") || null,
        documents: JSON.parse(String(form.get("documents") ?? "[]")),
        custom,
        parent: form.get("parentAccountId")
          ? {
              accountType: form.get("parentAccountType"),
              accountId: form.get("parentAccountId"),
            }
          : null,
      }),
    );
    revalidatePath("/pipeline");
    revalidatePath("/agencies/[id]", "page");
    revalidatePath("/wholesale/[id]", "page");
    return { success: "Account profile saved." };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : e instanceof z.ZodError
            ? "Check the profile fields."
            : "Could not save this profile. Reload and retry.",
    };
  }
}
