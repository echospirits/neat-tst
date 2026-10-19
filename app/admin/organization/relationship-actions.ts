"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../lib/auth";
import { requireOrganizationContext } from "../../../lib/organizations";
import { prisma } from "../../../lib/prisma";
import { healthRulesInput } from "../../../lib/crm/health";
import type { CrmActionResult } from "../../crm/actions";
export async function saveRelationshipSettings(
  form: FormData,
): Promise<CrmActionResult> {
  const user = await requireAdmin();
  const { organizationId } = await requireOrganizationContext(user);
  const parsed = healthRulesInput.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Use a whole number of days between 1 and 730." };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${organizationId}`}, 0))`;
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { crmPreferences: true },
    });
    const preferences = (org.crmPreferences ?? {}) as Prisma.JsonObject;
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        crmPreferences: {
          ...preferences,
          health: parsed.data,
        } as Prisma.InputJsonValue,
      },
    });
    await tx.organizationAuditEvent.create({
      data: {
        organizationId,
        actorUserId: user.id,
        action: "ORGANIZATION_UPDATED",
        metadata: {
          kind: "HEALTH_THRESHOLDS",
          before: preferences.health ?? {},
          after: parsed.data,
        },
      },
    });
  });
  for (const path of [
    "/admin/organization",
    "/pipeline",
    "/agencies/[id]",
    "/wholesale/[id]",
  ])
    revalidatePath(path, "page");
  return { success: "Relationship thresholds saved." };
}
