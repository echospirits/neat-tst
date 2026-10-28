// Owner-supplied files are tested in an explicitly isolated rehearsal database.
// No raw rows, filenames, prices or credentials are included in the result.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadEnvironmentFile } from '../lib/environmentFile';
import { ohioItemContext } from '../lib/productionForecasting/ohio';
import { importProductionSource } from '../lib/productionForecasting/import';
import { loadForecastSources, configuredProducts, refreshProductionForecast } from '../lib/productionForecasting/service';
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
loadEnvironmentFile('.env.rehearsal.local');
if (!process.env.DATABASE_TARGET_ID?.startsWith('forecast-rehearsal-') || new URL(process.env.DATABASE_URL!).hostname !== process.env.EXPECTED_DATABASE_HOST) throw new Error('Explicit rehearsal database required.');
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    const owner = await ohioItemContext(db, 'org_echo_spirits');
    const bailment = readFileSync(arg('bailment-file')!, 'utf8'), dc = readFileSync(arg('dc-file')!, 'utf8');
    for (const policy of ['invoice-date', 'shipment-only'] as const) {
      const id = `qa_source_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      await db.organization.create({ data: { id, name: id, slug: id, displayName: id, enabledStates: ['OH'], features: { create: { featureKey: 'PRODUCTION_FORECASTING', enabled: true } } } });
      await db.organizationProduct.createMany({ data: [...owner.included].map(externalItemCode => ({ organizationId: id, market: 'OH', externalItemCode, status: 'OWNED' })) });
      await db.ohlqTenantInventoryImportStatus.create({ data: { organizationId: id, reportDate: new Date('2026-10-28'), status: 'COMPLETED', diagnostics: { distilleryOnlyItemCodes: [...owner.distilleryOnly] } } });
      const options = { organizationId: id, market: 'OH', source: 'BAILMENT_PO_INVOICE' as const, start: '2019-01-01', end: '2026-10-26', observedOn: '2026-10-27', complete: true, nativeHistory: { fullPortfolio: true, directInvoices: policy } };
      const initial = await importProductionSource(bailment, options, db);
      assert.equal((await importProductionSource(bailment, options, db)).replay, true);
      const before = await db.productionDemandObservation.count({ where: { organizationId: id } });
      const first = await refreshProductionForecast(id, db, new Date('2026-10-27T16:00:00Z'));
      const saved = await db.productionForecastSnapshot.findMany({ where: { organizationId: id, runId: first.id }, select: { id: true, point: true, detail: true } });
      const later = await importProductionSource(bailment, { ...options, end: '2026-10-27', observedOn: '2026-10-28' }, db);
      await importProductionSource(dc, { ...options, source: 'DISTRIBUTION_CENTER', start: '2026-10-28', end: '2026-10-28', observedOn: '2026-10-28', nativeHistory: undefined }, db);
      const after = await db.productionDemandObservation.count({ where: { organizationId: id } });
      assert.ok(after - before < 100, 'Daily complete exports must not duplicate historical rows.');
      await refreshProductionForecast(id, db, new Date('2026-10-28T16:00:00Z'));
      assert.deepEqual(await db.productionForecastSnapshot.findMany({ where: { organizationId: id, runId: first.id }, select: { id: true, point: true, detail: true } }), saved);
      const products = await configuredProducts(db, id, ['OH']), source = await loadForecastSources(db, id, products, '2026-10-27');
      assert.ok(source.series.every(s => s.coverage.length === 1));
      assert.equal(source.series.some(s => owner.distilleryOnly.has(s.itemCode)), false);
      const snapshots = await db.productionForecastSnapshot.findMany({ where: { organizationId: id, runId: { not: first.id } }, select: { point: true } });
      assert.ok(snapshots.some(s => s.point !== null));
      console.log(JSON.stringify({ rehearsal: 'passed', policyHypothesis: policy, initialRows: initial.rowCount, latestRows: later.rowCount, versionsBefore: before, versionsAfter: after, addedVersions: after - before, numericForecasts: snapshots.filter(s => s.point !== null).length, excludedProducts: owner.distilleryOnly.size, guidanceRows: source.guidance.length, oldSnapshotsPreserved: true }));
    }
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.slice(0, 500) : 'Source rehearsal failed.'); process.exitCode = 1; });
