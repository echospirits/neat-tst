"use server";
import { revalidatePath } from "next/cache";
import { requireCrmActor } from "../../lib/crm/auth";
import { prisma } from "../../lib/prisma";
import { CrmError } from "../../lib/crm/activity";
import { relateContacts } from "../../lib/crm/contacts";
import type { CrmActionResult } from "../crm/actions";
export async function relateContactsAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor();
  try {
    await prisma.$transaction(
      (tx) => relateContacts(tx, actor, Object.fromEntries(form)),
      { timeout: 30000 },
    );
    revalidatePath("/agencies/[id]", "page");
    revalidatePath("/wholesale/[id]", "page");
    return {
      success:
        form.get("operation") === "MERGE"
          ? "Duplicate merged. History retained and the source contact archived."
          : "Contacts linked as the same person. Account roles retained.",
    };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : "Could not update the relationship. Check the selection and retry.",
    };
  }
}
