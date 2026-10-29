"use server";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { requireCrmActor } from "../../../lib/crm/auth";
import {
  readPipelineStages,
  pipelineStagesInput,
} from "../../../lib/crm/pipelineStages";
import { CrmError } from "../../../lib/crm/activity";
import type { CrmActionResult } from "../../../lib/crm/actionResult";
export async function savePipelineStages(
  form: FormData,
): Promise<CrmActionResult> {
  const { actor, user } = await requireCrmActor();
  if (!["ADMIN", "PLATFORM_ADMIN"].includes(user.role))
    return { error: "An administrator must configure stages." };
  const raw = String(form.get("configuration") ?? "");
  if (raw.length > 20000) return { error: "Too many stages." };
  try {
    const input = pipelineStagesInput.parse(JSON.parse(raw));
    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${actor.organizationId}`},0))`;
      const org = await db.organization.findUniqueOrThrow({
          where: { id: actor.organizationId },
          select: { crmPreferences: true },
        }),
        old = readPipelineStages(org.crmPreferences);
      if (old.version !== input.version)
        throw new CrmError("Stage settings changed. Reload before saving.");
      await db.organization.update({
        where: { id: actor.organizationId },
        data: {
          crmPreferences: {
            ...(org.crmPreferences as Prisma.JsonObject),
            pipelineStages: { ...input, version: old.version + 1 },
          } as Prisma.InputJsonValue,
        },
      });
      await db.organizationAuditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          metadata: { kind: "PIPELINE_STAGES", before: old, after: input },
        },
      });
    });
    revalidatePath("/admin/organization");
    revalidatePath("/pipeline");
    return {
      success:
        "Pipeline stages saved. Existing account statuses and purchase history were preserved.",
    };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : "Use unique stage names and valid relationship statuses.",
    };
  }
}
