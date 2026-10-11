import { prisma } from '../../../lib/prisma';
import { Prisma } from '@prisma/client';
import { formatEasternDateTime } from '../../../lib/dateTime';
export async function AssessmentRuns({ organizationId }: { organizationId: string }) {
  const [runs, lastFull, pending, outcomes] = await Promise.all([
    prisma.wholesaleAssessmentRun.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 12 }),
    prisma.wholesaleAssessmentRun.findFirst({ where: { organizationId, fullSweep: true, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } }),
    prisma.wholesaleAccountAssessment.count({ where: { organizationId, refreshRequestedAt: { not: null } } }),
    prisma.salesOpportunity.findMany({ where: { organizationId, outcomeSummary: { not: Prisma.DbNull } }, select: { id: true, title: true, outcomeSummary: true }, take: 25 }),
  ]);
  return <section className="card"><h2>Current assessment refresh</h2><p>Last full assessment refresh: {lastFull?.completedAt ? formatEasternDateTime(lastFull.completedAt) : 'Unavailable'} · {pending} assessments pending material changes.</p><p>SOURCE_ERROR means an import or source could not be refreshed; the last valid ratings remain visible. PARTIAL/FAILED means calculation or persistence needs retry. Complete represented periods remain authoritative even when shorter than 90 days. Scoring reads saved evidence; it never requests new research. Learning is inactive. Initial purchases and repeat dates are separate shadow outcomes.</p>
    {runs.map(run => <details className="compact-details" key={run.id}><summary>{formatEasternDateTime(run.startedAt)} · {run.fullSweep ? 'Full' : 'Targeted'} · {run.status} · {run.persisted}/{run.expected} persisted</summary>
      <p>Run {run.id} · Model {run.modelVersion} · Configuration {run.configurationId}</p><p>Effective window end {run.asOfDate?.toISOString().slice(0,10) ?? 'Unavailable'} · Completed {run.completedAt ? formatEasternDateTime(run.completedAt) : 'Not completed'}</p>
      <p>Expected {run.expected} · Evaluated {run.evaluated} · Persisted {run.persisted} · Skipped {run.skipped} · Ineligible {run.ineligible} · Failed {run.failed} · Unaccounted {Math.max(0, run.expected-run.persisted-run.skipped-run.failed)}</p>
      <p>Evidence modes: {JSON.stringify(run.evidenceCounts)}</p><p>Source coverage: {JSON.stringify(run.sourceCoverage)}</p>{Array.isArray(run.errors) && run.errors.length ? <p role="status">{JSON.stringify(run.errors)}</p> : null}
    </details>)}{!runs.length ? <p>No assessment run is recorded yet.</p> : null}
    <details><summary>Observed pursuit outcomes (shadow)</summary>{outcomes.map(o => <div key={o.id}><strong>{o.title}</strong><p>{JSON.stringify(o.outcomeSummary)}</p></div>)}{!outcomes.length ? <p>No qualifying outcome observations yet.</p> : null}</details>
  </section>;
}
