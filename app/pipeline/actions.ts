"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { requireFeatureForUser } from "../../lib/organizations";
import { CrmError } from "../../lib/crm/activity";
import { saveSalesPlan } from "../../lib/crm/pipeline";
import type { CrmActionResult } from "../crm/actions";
export async function saveSalesPlanAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  await requireFeatureForUser(user, "ACCOUNT_SALES_STATUS");
  try {
    await prisma.$transaction((tx) =>
      saveSalesPlan(tx, actor, Object.fromEntries(form)),
    );
    for (const path of ["/pipeline", "/agencies/[id]", "/wholesale/[id]"])
      revalidatePath(path, "page");
    return { success: "Account plan saved. Pipeline estimates updated." };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : e instanceof z.ZodError
            ? "Check the plan values."
            : "Could not save the plan. Please retry.",
    };
  }
}
