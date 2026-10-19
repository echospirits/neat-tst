import { z } from "zod";
const numberOrNull = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().finite().nonnegative().max(100000).nullable(),
);
export const recipeCostingInput = z.object({
  menuPrice: numberOrNull,
  targetMargin: numberOrNull.refine((v) => v === null || v <= 99),
  wastePercent: z.coerce.number().min(0).max(100).default(0),
  portions: z.coerce.number().int().min(1).max(10000).default(1),
  lines: z
    .array(
      z.object({ name: z.string().trim().min(1).max(160), cost: numberOrNull }),
    )
    .max(40)
    .default([]),
});
export function recipeCosts(raw: unknown) {
  const result = recipeCostingInput.safeParse(raw);
  const c = result.success
    ? result.data
    : {
        menuPrice: null,
        targetMargin: null,
        wastePercent: 0,
        portions: 1,
        lines: [],
      };
  const complete = c.lines.length > 0 && c.lines.every((l) => l.cost !== null);
  const cost = complete
    ? (c.lines.reduce((s, l) => s + l.cost!, 0) * (1 + c.wastePercent / 100)) /
      c.portions
    : null;
  return {
    ...c,
    cost,
    margin:
      cost !== null && c.menuPrice !== null && c.menuPrice > 0
        ? ((c.menuPrice - cost) / c.menuPrice) * 100
        : null,
    suggestedPrice:
      cost !== null && c.targetMargin !== null
        ? cost / (1 - c.targetMargin / 100)
        : null,
  };
}
