import { z } from "zod";
const days = z.coerce.number().int().min(1).max(730);
export const healthRulesInput = z.object({
  agencyContactDays: days.default(21),
  wholesaleContactDays: days.default(30),
  chainContactDays: days.default(45),
  purchaseDays: days.default(90),
  waitingDays: days.default(14),
});
export type HealthRules = z.infer<typeof healthRulesInput>;
export function healthRules(value: unknown): HealthRules {
  const parsed = healthRulesInput.safeParse(value);
  return parsed.success ? parsed.data : healthRulesInput.parse({});
}
export function accountHealth(input: {
  kind: "AGENCY" | "WHOLESALE" | "CHAIN";
  now: Date;
  lastMeaningful: Date | null;
  lastPurchase: Date | null;
  overdue: number;
  contacts: number;
  rules: HealthRules;
}) {
  const reasons: Array<{ label: string; penalty: number }> = [];
  const contactDays =
    input.kind === "AGENCY"
      ? input.rules.agencyContactDays
      : input.kind === "CHAIN"
        ? input.rules.chainContactDays
        : input.rules.wholesaleContactDays;
  const age = (date: Date) =>
    Math.max(0, Math.floor((input.now.getTime() - date.getTime()) / 86400000));
  if (!input.contacts)
    reasons.push({
      label: "No active relationship contact recorded",
      penalty: 20,
    });
  if (input.overdue)
    reasons.push({
      label: `${input.overdue} overdue Worklist commitments`,
      penalty: Math.min(30, input.overdue * 10),
    });
  if (input.lastMeaningful && age(input.lastMeaningful) > contactDays)
    reasons.push({
      label: `${age(input.lastMeaningful)} days since meaningful contact; threshold ${contactDays}`,
      penalty: 25,
    });
  if (input.lastPurchase && age(input.lastPurchase) > input.rules.purchaseDays)
    reasons.push({
      label: `${age(input.lastPurchase)} days since purchase evidence; threshold ${input.rules.purchaseDays}`,
      penalty: 25,
    });
  const missing = [
    !input.lastMeaningful ? "Meaningful contact history" : null,
    !input.lastPurchase ? "Purchase evidence" : null,
  ].filter((x): x is string => Boolean(x));
  return {
    score: missing.length
      ? null
      : Math.max(0, 100 - reasons.reduce((sum, r) => sum + r.penalty, 0)),
    reasons,
    missing,
    contactDays,
  };
}
