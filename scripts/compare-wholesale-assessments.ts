import { writeFileSync } from 'node:fs';
import { validateRuntimeEnvironment } from '../lib/appEnvironment';
import { prisma } from '../lib/prisma';

// Read-only comparison of newly defined stars with preserved actual prior results.
// No model is rerun here, and no legacy score is converted into stars.
async function main() {
  if (validateRuntimeEnvironment().appEnvironment === 'production') throw new Error('This development comparison refuses production.');
  const organizationId = process.argv[2];
  if (!organizationId) throw new Error('Provide an organization ID and optional untracked output JSON path.');
  const rows = await prisma.$queryRaw<Array<{ accountKey: string; rating: number | null; mode: string; status: string; reason: string | null;
    representedDays: number | null; from: string | null; through: string | null; compatiblePer30: number | null; leadingProductPer30: number | null;
    corePer30: number | null; oldPriority: number | null; priorCalculatedAt: Date | null }>>`
    WITH previous AS (
      SELECT DISTINCT ON ("wholesaleAccountId") "wholesaleAccountId", "assessment", "calculatedAt"
      FROM "WholesaleAssessmentSnapshot" WHERE "organizationId"=${organizationId} AND "assessmentStatus"='LEGACY'
      ORDER BY "wholesaleAccountId", "calculatedAt" DESC, "id"
    )
    SELECT md5(a."wholesaleAccountId") AS "accountKey", a."rating", a."evidenceMode" AS "mode", a."assessmentStatus" AS "status", a."assessmentReason" AS "reason",
      (a."assessment" #>> '{commercial,representedDays}')::float AS "representedDays",
      a."assessment" #>> '{coverage,representedFrom}' AS "from", a."assessment" #>> '{coverage,through}' AS "through",
      (a."assessment" #>> '{commercial,compatible750Per30}')::float AS "compatiblePer30",
      (a."assessment" #>> '{commercial,leadingProduct750Per30}')::float AS "leadingProductPer30",
      (a."assessment" #>> '{commercial,core750Per30}')::float AS "corePer30",
      (p."assessment" ->> 'priority')::float AS "oldPriority", p."calculatedAt" AS "priorCalculatedAt"
    FROM "WholesaleAccountAssessment" a LEFT JOIN previous p ON p."wholesaleAccountId"=a."wholesaleAccountId"
    WHERE a."organizationId"=${organizationId} ORDER BY md5(a."wholesaleAccountId")`;
  const counts = (values: Array<string | null>) => values.reduce<Record<string, number>>((a,v) => { a[v ?? 'Unrated'] = (a[v ?? 'Unrated'] ?? 0) + 1; return a; }, {});
  const rated = rows.filter(r => r.rating !== null);
  const compared = rows.filter(r => r.oldPriority !== null);
  const sorted = rated.map(r => r.compatiblePer30).filter((v): v is number => v !== null).sort((a,b) => a - b);
  const quantile = (fraction: number) => sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : null;
  const summary = { organizationId, comparisonPopulation: 'All current non-merged wholesale accounts evaluated for this enabled tenant, independent of salesperson, territory, pursuit and UI filters.',
    total: rows.length, rated: rated.length, unrated: rows.length - rated.length, withHistoricalComparison: compared.length,
    stars: counts(rows.map(r => r.rating === null ? null : String(r.rating))), evidenceModes: counts(rows.map(r => r.mode)), statuses: counts(rows.map(r => r.status)),
    previousHighLegacy70: compared.filter(r => r.oldPriority! >= 70).length, currentHighStars4Or5: rows.filter(r => r.rating !== null && r.rating >= 4).length,
    previousHighNowZero: compared.filter(r => r.oldPriority! >= 70 && r.rating === 0).length,
    zeroShareOfRated: rated.length ? rated.filter(r => r.rating === 0).length / rated.length : null,
    compatible750Per30Quantiles: { p10: quantile(.1), p30: quantile(.3), p50: quantile(.5), p90: quantile(.9), p99: quantile(.99) },
    representedPeriods: counts(rows.map(r => r.from && r.through ? `${r.from}..${r.through} (${r.representedDays} days)` : null)) };
  const result = { summary, sample: rows.slice(0, 100), surprisingChanges: compared.filter(r => r.oldPriority! >= 70 && (r.rating === null || r.rating <= 1)).slice(0, 20),
    limitations: ['Prior numeric scores and new stars answer different questions and may use different represented periods. This is an operational comparison, not predictive validation.',
      'Samples use a stable account-ID hash independent of ratings. No private account names or saved research are exported.',
      'The lower tail describes this whole-tenant population; it does not dynamically change versioned thresholds or force exactly 30 percent to zero.'] };
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ summary, limitations: result.limitations }, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
