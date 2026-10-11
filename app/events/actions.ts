"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError } from "../../lib/crm/activity";
import { saveEvent } from "../../lib/crm/events";
import type { CrmActionResult } from "../crm/actions";
export async function saveEventAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor();
  try {
    const data = Object.fromEntries(form),
      event = await prisma.$transaction((db) =>
        saveEvent(db, actor, {
          ...data,
          id: String(form.get("id") || "") || undefined,
          accountId: String(form.get("accountId") || "") || undefined,
          accountType: String(form.get("accountType") || "") || undefined,
          staffUserIds: form.getAll("staffUserId"),
          details: {
            products: form.get("products"),
            samples: form.get("samples"),
            cost: form.get("cost"),
            outcomes: form.get("outcomes"),
            photoLinks: form.get("photoLinks"),
            windowDays: form.get("windowDays"),
            comparison: form.get("comparison"),
          },
        }),
      );
    revalidatePath("/");
    revalidatePath(`/events/${event.id}`);
    return { success: "Event saved.", href: `/events/${event.id}` };
  } catch (e) {
    if (e instanceof CrmError) return { error: e.message };
    if (e instanceof z.ZodError)
      return {
        error:
          "Check the event title, dates, staff, and optional values. End must follow start within seven days.",
      };
    throw e;
  }
}
