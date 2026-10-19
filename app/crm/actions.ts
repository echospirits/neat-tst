"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { CrmError, correctActivity } from "../../lib/crm/activity";
import { disconnectMailbox, syncMailbox } from "../../lib/crm/mail/sync";
import { MockMailAdapter } from "../../lib/crm/mail/mock";
import { getAppEnvironment } from "../../lib/appEnvironment";
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
    "/visits",
    "/pipeline",
    "/settings/communications",
    "/agencies/[id]",
    "/wholesale/[id]",
  ])
    revalidatePath(path, "page");
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
        internalDomains: z.preprocess(value => String(value ?? '').split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean), z.array(z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/)).max(20)),
      })
      .parse(Object.fromEntries(form));
    if (input.historyDays > input.retentionDays)
      throw new CrmError("History must fit within the retention window.");
    const updated = await prisma.mailboxConnection.updateMany({
      where: { id: input.id, ...actor },
      data: {
        historyDays: input.historyDays,
        retentionDays: input.retentionDays,
        internalDomains: input.internalDomains,
        nextRetryAt: null,
        failureCount: 0,
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
