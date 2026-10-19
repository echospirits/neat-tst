import { setAccountSalesStatus } from "../accountSalesStatus";
import { readPipelineStages } from "./pipelineStages";
import { z } from "zod";
import { AccountSalesStatus } from "@prisma/client";
import {
  accountInput,
  assertAccount,
  CrmError,
  type CrmActor,
  type CrmDb,
} from "./activity";

const optionalNumber = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().finite().min(0).max(max).nullable(),
  );
export const salesPlanInput = accountInput.extend({
  stageKey: z.string().max(100).default(""),
  version: z.coerce.number().int().min(0),
  estimatedRevenue: optionalNumber(20_000_000),
  estimatedVolume: optionalNumber(1_000_000),
  probability: optionalNumber(100),
  expectedCloseDate: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !v ||
        (Number.isFinite(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Choose a valid date.",
    )
    .default(""),
  products: z.string().trim().max(2000).default(""),
  competitors: z.string().trim().max(2000).default(""),
  objections: z.string().trim().max(2000).default(""),
  objectives: z.string().trim().max(4000).default(""),
  placementEvidence: z.string().trim().max(2000).default(""),
});
export type SalesPlan = Omit<
  z.infer<typeof salesPlanInput>,
  "version" | "accountType" | "accountId"
>;
export function readSalesPlan(value: unknown): SalesPlan {
  const parsed = salesPlanInput.safeParse({
    accountType: "AGENCY",
    accountId: "_",
    version: 0,
    ...(typeof value === "object" && value ? value : {}),
  });
  if (!parsed.success)
    return {
      stageKey: "",
      estimatedRevenue: null,
      estimatedVolume: null,
      probability: null,
      expectedCloseDate: "",
      products: "",
      competitors: "",
      objections: "",
      objectives: "",
      placementEvidence: "",
    };
  const {
    accountType: _type,
    accountId: _id,
    version: _version,
    ...plan
  } = parsed.data;
  return plan;
}
export function pipelineForecast(
  rows: Array<{ salesStatus: AccountSalesStatus | null; salesPlan: unknown }>,
) {
  const open = rows.filter(
    (row) =>
      row.salesStatus &&
      !["LOST", "NURTURE", "PURCHASING"].includes(row.salesStatus),
  );
  const estimates = open.map((row) => readSalesPlan(row.salesPlan));
  return {
    accounts: open.length,
    valued: estimates.filter((p) => p.estimatedRevenue !== null).length,
    weighted: estimates.reduce(
      (sum, p) =>
        sum + ((p.estimatedRevenue ?? 0) * (p.probability ?? 0)) / 100,
      0,
    ),
    unweighted: estimates.reduce(
      (sum, p) => sum + (p.estimatedRevenue ?? 0),
      0,
    ),
    missingProbability: estimates.filter(
      (p) => p.estimatedRevenue !== null && p.probability === null,
    ).length,
  };
}
export async function saveSalesPlan(db: CrmDb, actor: CrmActor, raw: unknown) {
  const { accountType, accountId, version, ...plan } =
    salesPlanInput.parse(raw);
  await assertAccount(db, { accountType, accountId });
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-settings:${actor.organizationId}`},0))`;
  const key = {
    organizationId: actor.organizationId,
    accountType,
    externalAccountId: accountId,
  };
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(key)}, 0))`;
  const existing = await db.organizationAccountOverlay.findUnique({
    where: { organizationId_accountType_externalAccountId: key },
  });
  if ((existing?.salesPlanVersion ?? 0) !== version)
    throw new CrmError("This plan changed. Reload the account before saving.");
  if (plan.stageKey) {
    const org = await db.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
        select: { crmPreferences: true },
      }),
      stage = readPipelineStages(org.crmPreferences).stages.find(
        (s) => s.id === plan.stageKey,
      );
    if (!stage) throw new CrmError("Choose an available pipeline stage.");
    if (
      plan.stageKey !== readSalesPlan(existing?.salesPlan).stageKey ||
      existing?.salesStatus !== stage.status
    )
      await setAccountSalesStatus({
        db,
        organizationId: actor.organizationId,
        accountType,
        externalAccountId: accountId,
        status: stage.status,
        source: "USER",
        changedByUserId: actor.userId,
        context: `Pipeline stage: ${stage.name}`,
      });
  }
  await db.organizationAccountOverlay.upsert({
    where: { organizationId_accountType_externalAccountId: key },
    create: { ...key, salesPlan: plan, salesPlanVersion: 1 },
    update: { salesPlan: plan, salesPlanVersion: { increment: 1 } },
  });
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "ACCOUNT_SALES_PLAN",
        accountType,
        accountId,
        before: existing?.salesPlan ?? {},
        after: plan,
      },
    },
  });
}
