"use server";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import { accountInput, CrmError } from "../../lib/crm/activity";
import { loadAssistantEvidence } from "../../lib/crm/aiEvidence";
import {
  MockCommunicationAssistant,
  OpenAICommunicationAssistant,
  type AssistantResult,
  type AssistantEvidence,
} from "../../lib/crm/ai";
const input = accountInput.extend({
  purpose: z.enum(["BRIEFING", "FOLLOW_UP", "RESPONSE"]),
  includePrivate: z.boolean(),
  reviewed: z.literal(true),
});
export async function generateAccountAssistant(
  raw: unknown,
): Promise<{
  result?: AssistantResult;
  evidence?: AssistantEvidence[];
  error?: string;
}> {
  const { actor } = await requireCrmActor(true);
  try {
    const parsed = input.parse(raw);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { crmPreferences: true },
    });
    const live =
      (org.crmPreferences as { aiEnabled?: boolean })?.aiEnabled === true &&
      process.env.CRM_AI_ENABLED === "true" &&
      Boolean(process.env.OPENAI_API_KEY) &&
      Boolean(process.env.CRM_AI_MODEL);
    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-ai:${actor.organizationId}:${actor.userId}`},0))`;
      const count = await db.organizationAuditEvent.count({
        where: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          occurredAt: { gt: new Date(Date.now() - 3600000) },
          metadata: { path: ["kind"], equals: "CRM_ASSISTANT_REQUEST" },
        },
      });
      if (count >= 20)
        throw new CrmError("Hourly review limit reached. Try again later.");
      await db.organizationAuditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          metadata: {
            kind: "CRM_ASSISTANT_REQUEST",
            mode: live ? "AI" : "MOCK",
          },
        },
      });
    });
    const evidence = await loadAssistantEvidence(
        prisma,
        actor,
        parsed,
        parsed.includePrivate,
      ),
      provider = live
        ? new OpenAICommunicationAssistant(
            process.env.OPENAI_API_KEY!,
            process.env.CRM_AI_MODEL!,
          )
        : new MockCommunicationAssistant();
    const result = await provider.generate({
      ...evidence,
      purpose: parsed.purpose,
    });
    return { result, evidence: evidence.evidence };
  } catch (e) {
    return {
      error:
        e instanceof CrmError
          ? e.message
          : "The assistant could not complete this review. Your account records are unchanged.",
    };
  }
}
