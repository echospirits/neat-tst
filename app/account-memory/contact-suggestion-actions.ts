"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError } from "../../lib/crm/activity";
import { reviewContactSuggestion } from "../../lib/crm/contactSuggestions";
import type { CrmActionResult } from "../crm/actions";
export async function reviewContactSuggestionAction(
  form: FormData,
): Promise<CrmActionResult> {
  try {
    const { actor } = await requireCrmActor(true);
    const result = await prisma.$transaction(
      (tx) => reviewContactSuggestion(tx, actor, Object.fromEntries(form)),
      { maxWait: 10000, timeout: 30000 },
    );
    for (const path of [
      "/settings/communications",
      "/agencies/[id]",
      "/wholesale/[id]",
    ])
      revalidatePath(path, "page");
    return {
      success: result.contactId
        ? result.already
          ? "Existing contact found; no duplicate created."
          : "Contact saved. Private correspondence remains private."
        : "Suggestion dismissed for you.",
    };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : e instanceof z.ZodError
            ? "Check the name, account and review confirmation."
            : "Could not save. Your entries are retained; please retry.",
    };
  }
}
