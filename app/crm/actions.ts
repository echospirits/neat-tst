"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError, logActivity, correctActivity } from "../../lib/crm/activity";
import {
  createDeal,
  moveDeal,
  initializeDealStages,
  revenueCentsFromInput,
} from "../../lib/crm/deals";
import { disconnectMailbox, syncMailbox } from "../../lib/crm/mail/sync";
import { MockMailAdapter } from "../../lib/crm/mail/mock";
import { getAppEnvironment } from "../../lib/appEnvironment";
import { isAdminRole } from "../../lib/userAccess";
export type CrmActionResult = {
  success?: string;
  error?: string;
  href?: string;
};
const resultError = (e: unknown): CrmActionResult => ({
  error:
    e instanceof CrmError
      ? e.message
      : e instanceof z.ZodError
        ? e.issues[0]?.message || "Check the form values."
        : "Could not save. Your entries are retained; please retry.",
});
function refresh() {
  for (const path of [
    "/activities",
    "/deals",
    "/settings/communications",
    "/agencies/[id]",
    "/wholesale/[id]",
  ])
    revalidatePath(path, "page");
}
export async function saveActivityAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor();
  try {
    const data = Object.fromEntries(form);
    await prisma.$transaction((tx) =>
      logActivity(tx, actor, { ...data, meaningful: data.meaningful === "on" }),
    );
    refresh();
    return { success: "Activity saved. Physical visit history is unchanged." };
  } catch (e) {
    return resultError(e);
  }
}
export async function correctActivityAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    await prisma.$transaction((tx) =>
      correctActivity(tx, actor, Object.fromEntries(form)),
    );
    refresh();
    return { success: "Association and visibility saved with an audit entry." };
  } catch (e) {
    return resultError(e);
  }
}
export async function createDealAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor();
  try {
    const deal = await prisma.$transaction((tx) =>
      createDeal(tx, actor, {
        ...Object.fromEntries(form),
        revenueCents: revenueCentsFromInput(form.get("revenueAmount")),
      }),
    );
    refresh();
    return { success: "Deal created.", href: `/deals/${deal.id}` };
  } catch (e) {
    return resultError(e);
  }
}
export async function moveDealAction(form: FormData): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  try {
    await prisma.$transaction((tx) =>
      moveDeal(tx, actor, Object.fromEntries(form), isAdminRole(user.role)),
    );
    refresh();
    revalidatePath(`/deals/${form.get("id")}`);
    return { success: "Deal updated; stage history saved." };
  } catch (e) {
    return resultError(e);
  }
}
export async function setupStagesAction(): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (!isAdminRole(user.role))
    return {
      error: "An organization administrator must configure deal stages.",
    };
  try {
    await prisma.$transaction((tx) => initializeDealStages(tx, actor));
    refresh();
    return { success: "Default beverage sales stages are ready." };
  } catch (e) {
    return resultError(e);
  }
}
export async function saveStageAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (!isAdminRole(user.role))
    return { error: "Administrator access required." };
  try {
    const data = z
      .object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(80),
        position: z.coerce.number().int().min(0).max(1000),
        probability: z.coerce.number().int().min(0).max(100),
      })
      .parse(Object.fromEntries(form));
    if (data.id) {
      const saved = await prisma.dealStage.updateMany({
        where: { id: data.id, organizationId: actor.organizationId },
        data: {
          name: data.name,
          position: data.position,
          probability: data.probability,
        },
      });
      if (!saved.count) throw new CrmError("Stage not found.");
    } else
      await prisma.dealStage.create({
        data: {
          organizationId: actor.organizationId,
          name: data.name,
          position: data.position,
          probability: data.probability,
        },
      });
    refresh();
    return {
      success:
        "Stage saved. Existing deal probabilities remain unchanged until their next stage move.",
    };
  } catch (e) {
    return resultError(e);
  }
}
export async function syncMailboxAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    const id = z.string().min(1).parse(form.get("id"));
    const connection = await prisma.mailboxConnection.findFirst({
      where: { id, ...actor },
      select: { provider: true },
    });
    const mock = connection?.provider === "MOCK";
    if (mock && getAppEnvironment() === "production")
      throw new CrmError("Demo connections are disabled in production.");
    const result = await syncMailbox(
      actor,
      id,
      mock
        ? new MockMailAdapter([
            {
              id: "demo-email-1",
              kind: "EMAIL",
              threadId: "demo-thread",
              at: new Date().toISOString(),
              subject: "Demo: follow-up after product presentation",
              participants: ["unmatched-demo@example.invalid"],
              direction: "INBOUND",
            },
          ])
        : undefined,
    );
    refresh();
    return {
      success: `${result.saved} source record(s) processed. ${result.more ? "More history is available; synchronize again to continue." : "Synchronization checkpoint saved."}`,
    };
  } catch (e) {
    return resultError(e);
  }
}
export async function disconnectMailboxAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    await disconnectMailbox(
      actor,
      z.string().min(1).parse(form.get("id")),
      form.get("deleteHistory") === "on",
    );
    refresh();
    return {
      success:
        "Disconnected and stored tokens removed. Revoke the app in your provider settings to remove provider-side consent.",
    };
  } catch (e) {
    return resultError(e);
  }
}
export async function demoMailboxAction(): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  if (getAppEnvironment() === "production")
    return { error: "Demo mode is disabled in production." };
  try {
    await prisma.mailboxConnection.upsert({
      where: { organizationId_userId_provider: { ...actor, provider: "MOCK" } },
      create: {
        ...actor,
        provider: "MOCK",
        providerAccountId: "demo",
        email: "rep@example.invalid",
        scope: "fixture",
        enabled: true,
      },
      update: {
        enabled: true,
        cursor: Prisma.DbNull,
        lastSyncAt: null,
        leaseId: null,
        leaseUntil: null,
      },
    });
    refresh();
    return {
      success:
        "Demo connection created. Synchronize to load fixture metadata; no provider is contacted.",
    };
  } catch (e) {
    return resultError(e);
  }
}
export async function mailboxSettingsAction(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor } = await requireCrmActor(true);
  try {
    const input = z
      .object({
        id: z.string().min(1),
        historyDays: z.coerce.number().int().min(1).max(90),
        retentionDays: z.coerce.number().int().min(7).max(365),
      })
      .parse(Object.fromEntries(form));
    if (input.historyDays > input.retentionDays)
      throw new CrmError("History must fit within the retention window.");
    const updated = await prisma.mailboxConnection.updateMany({
      where: { id: input.id, ...actor },
      data: {
        historyDays: input.historyDays,
        retentionDays: input.retentionDays,
        excludeInternal: form.get("excludeInternal") === "on",
        cursor: Prisma.DbNull,
        leaseId: null,
        leaseUntil: null,
      },
    });
    if (!updated.count) throw new CrmError("Connection not found.");
    refresh();
    return {
      success:
        "Scope saved. The next sync restarts the bounded history scan and applies retention.",
    };
  } catch (e) {
    return resultError(e);
  }
}
import { Prisma } from "@prisma/client";
