"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import { visitGuideInput } from "../../../lib/crm/visitGuides";
import type { Prisma } from "@prisma/client";
import type { CrmActionResult } from "../../../lib/crm/actionResult";
export async function saveVisitGuides(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
    return { error: "An administrator must edit visit guides." };
  const parsed = visitGuideInput.safeParse(
    ["AGENCY", "WHOLESALE"].map((accountType) => ({
      accountType,
      name: form.get(`${accountType}Name`),
      questions: String(form.get(`${accountType}Questions`) ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    })),
  );
  if (!parsed.success)
    return {
      error: "Give each guide a name and 1–8 prompts of up to 300 characters.",
    };
  await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${actor.organizationId}`},0))`;
    const org = await db.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { crmPreferences: true },
    });
    await db.organization.update({
      where: { id: actor.organizationId },
      data: {
        crmPreferences: {
          ...(org.crmPreferences as Prisma.JsonObject),
          visitGuides: parsed.data,
        } as Prisma.InputJsonValue,
      },
    });
    await db.organizationAuditEvent.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "ORGANIZATION_UPDATED",
        metadata: { kind: "VISIT_GUIDES_CHANGED", guides: parsed.data },
      },
    });
  });
  revalidatePath("/admin/organization");
  revalidatePath("/visits/new");
  return { success: "Visit guides saved." };
}
