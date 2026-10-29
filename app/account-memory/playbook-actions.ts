"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError } from "../../lib/crm/activity";
import { FollowUpError } from "../../lib/contextualFollowUp";
import {
  startPlaybook,
  cancelPlaybook,
  savePlaybook,
  defaultPlaybooks,
} from "../../lib/crm/playbooks";
import { scheduleWorklistSync } from "../../lib/calendar/scheduleWorklistSync";
import type { CrmActionResult } from "../../lib/crm/actionResult";
function refresh() {
  for (const path of [
    "/alerts",
    "/my-week",
    "/",
    "/admin/organization",
    "/agencies/[id]",
    "/wholesale/[id]",
  ])
    revalidatePath(path, "page");
}
async function run(
  action: () => Promise<CrmActionResult>,
): Promise<CrmActionResult> {
  try {
    return await action();
  } catch (e) {
    if (e instanceof CrmError || e instanceof FollowUpError)
      return { error: e.message };
    if (e instanceof z.ZodError)
      return { error: "Check the name, steps, owner, and date." };
    if (typeof e === "object" && e && "code" in e && e.code === "P2002")
      return { error: "A playbook with that name already exists." };
    throw e;
  }
}
export async function startPlaybookAction(form: FormData) {
  return run(async () => {
    const { actor, user } = await requireCrmActor();
    const result = await prisma.$transaction(
      (db) => startPlaybook(db, actor, user, Object.fromEntries(form)),
      { timeout: 20000 },
    );
    result.taskIds.forEach(scheduleWorklistSync);
    refresh();
    return {
      success: result.replay
        ? "This playbook is already on the Worklist."
        : `${result.taskIds.length} tasks added to the Worklist.`,
    };
  });
}
export async function cancelPlaybookAction(form: FormData) {
  return run(async () => {
    const { actor } = await requireCrmActor();
    const result = await prisma.$transaction((db) =>
      cancelPlaybook(db, actor, String(form.get("runId") ?? "")),
    );
    result.taskIds.forEach(scheduleWorklistSync);
    refresh();
    return {
      success: `${result.taskIds.length} untouched tasks cancelled. ${result.skipped} started or edited tasks kept on the Worklist.`,
    };
  });
}
export async function savePlaybookAction(form: FormData) {
  return run(async () => {
    const { actor, user } = await requireCrmActor();
    if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
      return { error: "An administrator must edit templates." };
    const titles = form.getAll("stepTitle"),
      days = form.getAll("stepDay"),
      details = form.getAll("stepDetail");
    await prisma.$transaction((db) =>
      savePlaybook(db, actor, {
        id: String(form.get("id") || "") || undefined,
        version: form.get("version"),
        name: form.get("name"),
        active: form.get("active") === "on",
        steps: titles.map((title, i) => ({
          title,
          day: days[i],
          detail: details[i],
        })),
      }),
    );
    refresh();
    return {
      success:
        "Playbook saved. Runs already in progress keep their original steps.",
    };
  });
}
export async function addDefaultPlaybooks() {
  return run(async () => {
    const { actor, user } = await requireCrmActor();
    if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
      return { error: "An administrator must add templates." };
    await prisma.$transaction(async (db) => {
      for (const template of defaultPlaybooks) {
        const old = await db.salesPlaybook.findUnique({
          where: {
            organizationId_name: {
              organizationId: actor.organizationId,
              name: template.name,
            },
          },
        });
        if (!old)
          await savePlaybook(db, actor, {
            ...template,
            version: 0,
            active: true,
          });
      }
    });
    refresh();
    return {
      success: "Starter templates added. Existing templates were kept.",
    };
  });
}
