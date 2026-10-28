import { createHash } from 'node:crypto';
import type { NormalizedRow, SourceScope } from './import';

export type StoredDemandVersion = {
  id: string; sourceLineId: string; date: string; availableOn: string; cases: number;
  itemCode: string; locationCode: string; locationName: string;
  classification: NormalizedRow['classification']; status: string; versionAt: string;
};
export const demandIdentity = (sourceLineId: string, date: string) => /^v1:[a-f0-9]{64}$/.test(sourceLineId)
  ? sourceLineId : `v1:${createHash('sha256').update(JSON.stringify([sourceLineId, date])).digest('hex')}`;
export const scopeIdentity = (s: Pick<SourceScope, 'itemCode' | 'locationCode'>) => JSON.stringify([s.itemCode, s.locationCode]);
const equivalent = (a: Pick<NormalizedRow, 'cases' | 'classification' | 'status'>, b: Pick<NormalizedRow, 'cases' | 'classification' | 'status'>) => a.cases === b.cases && a.classification === b.classification && a.status === b.status;

/** Repeated complete reports append only changed versions. Historical source
 * corrections become known on detection, while their earlier versions survive. */
export function reconcileDemandRows(rows: NormalizedRow[], previous: StoredDemandVersion[], priorCoverage: Map<string, string>, knownOn: string) {
  const latest = new Map<string, StoredDemandVersion>();
  for (const row of previous) {
    const key = demandIdentity(row.sourceLineId, row.date), old = latest.get(key);
    if (!old || row.versionAt > old.versionAt || (row.versionAt === old.versionAt && row.id > old.id)) latest.set(key, row);
  }
  const desired = new Map(rows.map(row => [demandIdentity(row.sourceLineId, row.date), row]));
  if (desired.size !== rows.length) throw new Error('Duplicate normalized source identities. No versions were saved.');
  const writes: Array<{ row: NormalizedRow; originalSourceLineId: string | null; previousObservationId: string | null; removed: boolean }> = [];
  let added = 0, changed = 0, removed = 0, unchanged = 0;
  for (const [key, row] of desired) {
    const old = latest.get(key);
    if (old && equivalent(row, old)) { unchanged++; continue; }
    const coveredThrough = priorCoverage.get(scopeIdentity(row));
    const late = Boolean(old || (coveredThrough && row.date <= coveredThrough));
    const availableOn = late && row.availableOn < knownOn ? knownOn : row.availableOn;
    writes.push({ row: { ...row, sourceLineId: key, availableOn }, originalSourceLineId: row.sourceLineId, previousObservationId: old?.id ?? null, removed: false });
    if (old) changed++; else added++;
  }
  for (const [key, old] of latest) if (!desired.has(key) && old.cases !== 0) {
    removed++;
    writes.push({ row: { ...old, sourceLineId: key, availableOn: knownOn, cases: 0, status: 'POSTED', minimum: null, maximum: null }, originalSourceLineId: null, previousObservationId: old.id, removed: true });
  }
  // Reject likely truncated/filtered exports rather than erasing demand. Small
  // genuine removals remain auditable tombstones with retained prior versions.
  const positivePrevious = [...latest.values()].filter(r => r.cases > 0).length;
  if (removed > Math.max(10, Math.floor(positivePrevious * 0.05))) throw new Error('Complete report lost too many historical movements. Check export filters or truncation before retrying.');
  return { writes, added, changed, removed, unchanged };
}

export function mergeCoverage(windows: Array<{ start: string; end: string }>) {
  const merged: Array<{ start: string; end: string }> = [];
  for (const window of windows.slice().sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    const old = merged.at(-1);
    if (old && Date.parse(window.start) <= Date.parse(old.end) + 86400000) { if (window.end > old.end) old.end = window.end; }
    else merged.push({ ...window });
  }
  return merged;
}
