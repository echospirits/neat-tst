import { getOhlqLicenseeMatchKeys } from './ohlqWholesaleMatching';
import type { SalesCoverage } from './wholesaleAssessment';

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export const assessmentDay = (date: Date) => new Date(`${isoDay(date)}T00:00:00Z`);
export function windowDates(asOf: Date, days = 90) {
  return Array.from({ length: days }, (_, i) => isoDay(new Date(asOf.getTime() - i * 86_400_000)));
}
/** Longest contiguous certified period in the latest 90 calendar days.
 * Ties prefer the newer end date. Missing source days split blocks; account
 * purchase dates never do. This favors a stable represented period over a
 * fragment following an ingestion gap, while recording its actual dates.
 * Source dates are daily exports (From date = To date), not cumulative YTD rows.
 */
export function representedWindow(asOf: Date, completeDates: Set<string>) {
  let best: string[] = [], current: string[] = [];
  for (const date of windowDates(asOf)) {
    if (completeDates.has(date)) current.push(date);
    else { if (current.length > best.length) best = current; current = []; }
  }
  if (current.length > best.length) best = current;
  return { from: best.at(-1) ?? null, through: best[0] ?? null, days: best.length, dates: new Set(best) };
}
export type AccountIdentity = { id: string; licenseeId: string | null; licenseeIds: { licenseeId: string }[] };
export function identityCoverage(accounts: AccountIdentity[]) {
  const owners = new Map<string, Set<string>>();
  const keys = new Map(accounts.map(a => [a.id, [...new Set([a.licenseeId, ...a.licenseeIds.map(x => x.licenseeId)].flatMap(getOhlqLicenseeMatchKeys))]]));
  for (const [id, aliases] of keys) for (const key of aliases) owners.set(key, new Set([...(owners.get(key) ?? []), id]));
  return new Map(accounts.map(a => {
    const aliases = keys.get(a.id)!;
    return [a.id, !aliases.length ? 'UNMATCHED' : aliases.some(key => owners.get(key)!.size > 1) ? 'AMBIGUOUS' : 'MATCHED'] as const;
  }));
}
export function sourceCoverage({ asOf, completeDates, identity, hasPurchases, through }: {
  asOf: Date; completeDates: Set<string>; identity: SalesCoverage['identity']; hasPurchases: boolean; through: string | null;
}): SalesCoverage {
  const selected = representedWindow(asOf, completeDates);
  const mode = identity === 'MATCHED' && selected.days > 0 ? 'SALES_BACKED' : 'RESEARCH_ONLY';
  const days = mode === 'SALES_BACKED' ? selected.days : 0;
  return { mode, through: mode === 'RESEARCH_ONLY' ? null : selected.through ?? through, representedFrom: mode === 'SALES_BACKED' ? selected.from : null,
    representedDays: days, expectedDays: days, completeDays: days, identity,
    missingDates: [], verifiedZero: mode === 'SALES_BACKED' && !hasPurchases,
    limitations: [...(mode === 'RESEARCH_ONLY' ? ['Sales data is unavailable; this assessment uses stored research only.'] : [
      ...(days < 90 ? [`Complete ${days}-day represented period; quantities are normalized to 30 days. No short-history rating penalty.`] : []),
      ...(selected.through !== isoDay(asOf) ? [`The selected complete foundation ends ${selected.through}. Newer shorter source blocks are shown separately as context; unavailable days are not zero sales.`] : []),
    ]),
      ...(identity === 'AMBIGUOUS' || identity === 'UNMATCHED' ? ['Sales identity is ambiguous or unmatched; no verified zero or full-market volume claim.'] : [])] };
}

// The import completion revision changes on same-date corrections, including zero rows.
export function reportRevision(report: { updatedAt: Date; rowCount: number }) {
  return `${report.updatedAt.toISOString()}:${report.rowCount}`;
}
