"use server";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import { revalidatePath } from "next/cache";
export async function saveAiSetting(form: FormData) {
  const { actor, user } = await requireCrmActor(true);
  if (user.role !== "ADMIN")
    return { error: "An organization administrator must configure AI." };
  await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${actor.organizationId}`},0))`;
    const org = await db.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
        select: { crmPreferences: true },
      }),
      enabled = form.get("enabled") === "on";
    await db.organization.update({
      where: { id: actor.organizationId },
      data: {
        crmPreferences: {
          ...(org.crmPreferences as Prisma.JsonObject),
          aiEnabled: enabled,
        },
      },
    });
    await db.organizationAuditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "ORGANIZATION_UPDATED",
        metadata: { kind: "CRM_AI_SETTING", enabled },
      },
    });
  });
  revalidatePath("/admin/organization");
  return {
    success:
      "AI preference saved. Live use also requires deployment credentials and a configured model.",
  };
}
