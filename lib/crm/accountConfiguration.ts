import { z } from "zod";
const id = z.string().uuid();
export const territoryInput = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  states: z.string().max(200).default(""),
  counties: z.string().max(2000).default(""),
  postalCodes: z.string().max(2000).default(""),
  ownerUserId: z.string().max(100).default(""),
});
export const accountConfigurationInput = z
  .object({
    version: z.coerce.number().int().min(0),
    territories: z.array(territoryInput).max(50),
    categories: z
      .array(z.object({ id, name: z.string().trim().min(1).max(100) }))
      .max(30)
      .default([]),
    fields: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(100),
          type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN"]),
        }),
      )
      .max(30),
    teams: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(100),
          memberIds: z.array(z.string().max(100)).max(100),
        }),
      )
      .max(30),
  })
  .refine(
    (v) =>
      [v.territories, v.fields, v.teams, v.categories].every(
        (rows) =>
          new Set(rows.map((r) => r.id)).size === rows.length &&
          new Set(rows.map((r) => r.name.toLowerCase())).size === rows.length,
      ),
    "Names and identifiers must be unique.",
  );
export type AccountConfiguration = z.infer<typeof accountConfigurationInput>;
export function readAccountConfiguration(
  preferences: unknown,
): AccountConfiguration {
  const parsed = accountConfigurationInput.safeParse(
    (preferences as { accountConfiguration?: unknown })?.accountConfiguration,
  );
  return parsed.success
    ? parsed.data
    : { version: 0, territories: [], fields: [], teams: [], categories: [] };
}
export const accountKinds = [
  "ON_PREMISE",
  "OFF_PREMISE",
  "LIQUOR_AGENCY",
  "DISTRIBUTOR",
  "RETAIL_CHAIN",
  "HOSPITALITY_GROUP",
  "HOTEL",
  "EVENT_VENUE",
  "OTHER",
] as const;
const split = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
export function territoryMatches(
  territory: z.infer<typeof territoryInput>,
  account: { state: string | null; county: string | null; zip: string | null },
) {
  const states = split(territory.states),
    counties = split(territory.counties),
    zips = split(territory.postalCodes);
  return (
    states.length + counties.length + zips.length > 0 &&
    (!states.length || states.includes(account.state?.toLowerCase() ?? "")) &&
    (!counties.length ||
      counties.includes(account.county?.toLowerCase() ?? "")) &&
    (!zips.length || zips.includes(account.zip?.slice(0, 5) ?? ""))
  );
}
export function validateCustomValues(
  config: AccountConfiguration,
  raw: Record<string, unknown>,
) {
  const values: Record<string, string | number | boolean | null> = {};
  for (const f of config.fields) {
    const v = raw[f.id];
    if (v === null || v === undefined || v === "") {
      values[f.id] = null;
      continue;
    }
    if (f.type === "NUMBER") {
      const n = Number(v);
      if (!Number.isFinite(n) || Math.abs(n) > 1e12)
        throw Error(`Enter a valid number for ${f.name}.`);
      values[f.id] = n;
    } else if (f.type === "DATE") {
      const s = String(v);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
        new Date(s).toISOString().slice(0, 10) !== s
      )
        throw Error(`Enter a valid date for ${f.name}.`);
      values[f.id] = s;
    } else if (f.type === "BOOLEAN") {
      if (!["true", "false", true, false].includes(v as never))
        throw Error(`Choose yes or no for ${f.name}.`);
      values[f.id] = v === true || v === "true";
    } else {
      if (String(v).length > 2000) throw Error(`${f.name} is too long.`);
      values[f.id] = String(v).trim();
    }
  }
  return values;
}
