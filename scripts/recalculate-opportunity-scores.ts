import { writeFileSync } from 'node:fs';
import { validateRuntimeEnvironment } from '../lib/appEnvironment';
import { prisma } from '../lib/prisma';
import { enabledAssessmentTenants, evaluateWholesaleAssessments } from '../lib/wholesaleAssessmentService';
const arg = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
async function main() {
  const environment = validateRuntimeEnvironment();
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) throw new Error('Choose --apply or --dry-run, not both.');
  if (environment.appEnvironment === 'production') throw new Error('This development recalculation command refuses production.');
  const asOfDate = arg('--as-of') ? new Date(`${arg('--as-of')}T00:00:00Z`) : new Date();
  if (!Number.isFinite(asOfDate.getTime())) throw new Error('--as-of must be an ISO calendar date.');
  const organizations = await prisma.organization.findMany({ where: { ...enabledAssessmentTenants, ...(arg('--organization') ? { id: arg('--organization') } : {}) }, select: { id: true } });
  if (!organizations.length) throw new Error('No enabled organization matches this request.');
  const results = [];
  for (const organization of organizations) {
    try {
    const result = await evaluateWholesaleAssessments({ organizationId: organization.id, asOfDate, dryRun: !apply, reconcileLedger: apply, accountIds: arg('--account') ? [arg('--account')!] : undefined });
    const distribution = apply
      ? Object.fromEntries((await prisma.wholesaleAccountAssessment.groupBy({ by: ['rating'], where: { organizationId: organization.id, ...(arg('--account') ? { wholesaleAccountId: arg('--account') } : {}) }, _count: { _all: true } })).map(row => [row.rating === null ? 'Unrated' : String(row.rating), row._count._all]))
      : result.previews.reduce<Record<string, number>>((totals, row) => { const key = row.assessment.rating === null ? 'Unrated' : String(row.assessment.rating); totals[key] = (totals[key] ?? 0) + 1; return totals; }, {});
    const summary = { organizationId: organization.id, expected: result.expected, evaluated: result.evaluated, persisted: result.persisted, skipped: result.skipped,
      ineligible: result.ineligible, failed: result.failed, sourceBlocked: result.sourceBlocked, evidenceCounts: result.evidenceCounts, runId: result.runId, distribution };
    // Inputs can include private saved research. Export them only when explicitly requested.
    results.push({ ...summary, ...(process.argv.includes('--include-inputs') ? { previews: result.previews } : {}) });
    console.log(JSON.stringify(summary));
    if (result.failed || result.sourceBlocked || apply && result.persisted !== result.expected) process.exitCode = 1;
    } catch {
      console.error(`Assessment refresh failed for ${organization.id}; inspect run status and retry scoring.`);
      results.push({ organizationId: organization.id, failed: true });
      process.exitCode = 1;
    }
  }
  if (arg('--output')) writeFileSync(arg('--output')!, JSON.stringify(results, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Recalculation failed'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
