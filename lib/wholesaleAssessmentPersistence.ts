import { Prisma } from '@prisma/client';
import type { Assessment } from './wholesaleAssessment';
export type AssessmentWrite = { organizationId: string; accountId: string; runId: string; configurationId: string; inputsReadAt: Date; assessment: Assessment; status?: string; reason?: string };
/** One bound JSON parameter, one upsert per batch. Feedback columns deliberately stay untouched. */
export async function persistAssessmentBatch(tx: Prisma.TransactionClient, writes: AssessmentWrite[]) {
  if (!writes.length) return 0;
  const data = writes.map(w => ({ id: `${w.organizationId}:${w.accountId}`, organizationId: w.organizationId, wholesaleAccountId: w.accountId,
    runId: w.runId, configurationId: w.configurationId, modelVersion: w.assessment.version, asOfDate: w.assessment.asOf,
    calculatedAt: w.assessment.calculatedAt, researchAt: w.assessment.researchAt, evidenceMode: w.assessment.evidenceMode,
    state: w.assessment.state, rating: w.assessment.rating, assessmentStatus: w.status ?? w.assessment.state, assessmentReason: w.reason ?? w.assessment.ratingReason,
    priority: w.assessment.priority, priorityBand: w.assessment.band, effort: w.assessment.effort,
    title: w.assessment.title, action: w.assessment.action, assessment: w.assessment }));
  return tx.$executeRaw(Prisma.sql`
    WITH published AS (
    INSERT INTO "WholesaleAccountAssessment" ("id", "organizationId", "wholesaleAccountId", "runId", "configurationId", "modelVersion", "asOfDate", "calculatedAt", "researchAt", "evidenceMode", "state", "rating", "assessmentStatus", "assessmentReason", "priority", "priorityBand", "effort", "title", "action", "assessment")
    SELECT "id", "organizationId", "wholesaleAccountId", "runId", "configurationId", "modelVersion", "asOfDate"::date, "calculatedAt"::timestamp, "researchAt"::timestamp, "evidenceMode", "state", "rating", "assessmentStatus", "assessmentReason", "priority", "priorityBand", "effort", "title", "action", "assessment"
    FROM jsonb_to_recordset(${JSON.stringify(data)}::jsonb) AS x("id" text, "organizationId" text, "wholesaleAccountId" text, "runId" text, "configurationId" text, "modelVersion" text, "asOfDate" text, "calculatedAt" text, "researchAt" text, "evidenceMode" text, "state" text, "rating" integer, "assessmentStatus" text, "assessmentReason" text, "priority" double precision, "priorityBand" text, "effort" text, "title" text, "action" text, "assessment" jsonb)
    ON CONFLICT ("organizationId", "wholesaleAccountId") DO UPDATE SET
      "runId" = EXCLUDED."runId", "configurationId" = EXCLUDED."configurationId", "modelVersion" = EXCLUDED."modelVersion",
      "asOfDate" = EXCLUDED."asOfDate", "calculatedAt" = EXCLUDED."calculatedAt", "researchAt" = EXCLUDED."researchAt",
      "evidenceMode" = EXCLUDED."evidenceMode", "state" = EXCLUDED."state", "priority" = EXCLUDED."priority",
      "rating" = EXCLUDED."rating", "assessmentStatus" = EXCLUDED."assessmentStatus", "assessmentReason" = EXCLUDED."assessmentReason",
      "priorityBand" = EXCLUDED."priorityBand", "effort" = EXCLUDED."effort", "title" = EXCLUDED."title", "action" = EXCLUDED."action", "assessment" = EXCLUDED."assessment",
      "refreshRequestedAt" = CASE WHEN "WholesaleAccountAssessment"."refreshRequestedAt" > ${writes[0].inputsReadAt}::timestamp THEN "WholesaleAccountAssessment"."refreshRequestedAt" ELSE NULL END
    WHERE "WholesaleAccountAssessment"."asOfDate" <= EXCLUDED."asOfDate"
    RETURNING *
    )
    INSERT INTO "WholesaleAssessmentSnapshot" ("id", "organizationId", "wholesaleAccountId", "runId", "modelVersion", "configurationId", "asOfDate", "calculatedAt", "rating", "assessmentStatus", "assessmentReason", "assessment")
    SELECT "runId" || ':' || "wholesaleAccountId", "organizationId", "wholesaleAccountId", "runId", "modelVersion", "configurationId", "asOfDate", "calculatedAt", "rating", "assessmentStatus", "assessmentReason", "assessment" FROM published
    ON CONFLICT ("runId", "wholesaleAccountId") DO UPDATE SET "id" = "WholesaleAssessmentSnapshot"."id"
  `);
}
