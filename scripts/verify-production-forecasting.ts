// Integration checks run only in the explicitly named disposable TST branch.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvironmentFile } from '../lib/environmentFile';
import { days } from '../lib/productionForecasting/model';
loadEnvironmentFile('.env.rehearsal.local');
if (!process.env.DATABASE_TARGET_ID?.startsWith('forecast-rehearsal-') || new URL(process.env.DATABASE_URL!).hostname !== process.env.EXPECTED_DATABASE_HOST) throw new Error('Disposable rehearsal database required.');
const rehearsalConnection = new URL(process.env.DATABASE_URL!);
rehearsalConnection.hostname = rehearsalConnection.hostname.replace('-pooler.', '.');
process.env.DATABASE_URL = rehearsalConnection.toString();
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const { importProductionSource } = await import('../lib/productionForecasting/import');
  const { getProductionDashboard, getProductionProduct, refreshProductionForecast } = await import('../lib/productionForecasting/service');
  const db = new PrismaClient();
  const token = randomUUID().replaceAll('-', '').slice(0, 10), a = `qa_forecast_a_${token}`, b = `qa_forecast_b_${token}`;
  try {
    for (const id of [a, b]) await db.organization.create({ data: { id, name: id, displayName: id, slug: id, active: true, accountStatus: 'ACTIVE', enabledStates: ['OH'], features: { create: [{ featureKey: 'CORE_CRM', enabled: true }, { featureKey: 'ANALYTICS', enabled: true }, { featureKey: 'PRODUCTION_FORECASTING', enabled: id === a }] } } });
    const p = await db.organizationProduct.create({ data: { organizationId: a, market: 'OH', externalItemCode: 'RUM', displayName: 'Rehearsal Rum', status: 'OWNED' } });
    await db.organizationProduct.create({ data: { organizationId: a, market: 'OH', externalItemCode: 'DIST', displayName: 'Distillery only', status: 'OWNED' } });
    const other = await db.organizationProduct.create({ data: { organizationId: b, market: 'OH', externalItemCode: 'SECRET', status: 'REPRESENTED' } });
    await db.ohlqTenantInventoryImportStatus.create({ data: { organizationId: a, reportDate: new Date('2026-07-31'), status: 'COMPLETED', diagnostics: { distilleryOnlyItemCodes: ['DIST'] } } });
    const header = 'source_line_id,movement_date,available_on,item_code,location_code,location_name,classification,transaction_status,cases';
    const file = (start: string, end: string) => header + '\n' + days(start, end).flatMap(date => [`${date}-gpt,${date},${date},RUM,GPT,Groveport,A3A_BAIL,SHIPPED,2`, `${date}-grn,${date},${date},RUM,GRN,Green,BAILMENT,SHIPPED,1`, `${date}-dist,${date},${date},DIST,GPT,Groveport,BAILMENT,SHIPPED,100000`]).join('\n');
    const options = { organizationId: a, market: 'OH', source: 'BAILMENT_PO_INVOICE' as const, start: '2024-01-01', end: '2026-07-31', observedOn: '2026-07-31', complete: true };
    const imported = await importProductionSource(file(options.start, options.end), options, db);
    assert.equal(imported.replay, false); assert.ok(imported.excludedRows > 0);
    assert.equal((await importProductionSource(file(options.start, options.end), options, db)).replay, true);
    await assert.rejects(() => importProductionSource(file(options.start, options.end).replace(',SHIPPED,2', ',SHIPPED,3'), options, db), /immutable demand slice/);
    await assert.rejects(() => importProductionSource(header + '\nx,2026-07-01,2026-07-01,SECRET,GPT,Groveport,BAILMENT,SHIPPED,2', options, db), /Organization product/);
    assert.equal(await db.productionSourceImport.count({ where: { organizationId: a, status: 'FAILED' } }), 2);
    await assert.rejects(() => getProductionDashboard(b, db), /unavailable/);
    const first = await refreshProductionForecast(a, db, new Date('2026-08-01T12:00:00Z'));
    const count = await db.productionForecastSnapshot.count({ where: { organizationId: a } });
    assert.equal((await refreshProductionForecast(a, db, new Date('2026-08-01T12:00:00Z'))).id, first.id);
    assert.equal(await db.productionForecastSnapshot.count({ where: { organizationId: a } }), count);
    let detail = await getProductionProduct(a, p.id, db);
    assert.equal(detail?.forecast?.point, 90); assert.equal(detail?.forecast?.locations.length, 2);
    const dist = await db.productionForecastSnapshot.findFirstOrThrow({ where: { organizationId: a, itemCode: 'DIST' } }); assert.equal(dist.point, null);
    await db.organizationFeature.update({ where: { organizationId_featureKey: { organizationId: b, featureKey: 'PRODUCTION_FORECASTING' } }, data: { enabled: true } });
    assert.equal(await getProductionProduct(b, p.id, db), null); assert.equal(await getProductionProduct(a, other.id, db), null);
    const bDashboard = await getProductionDashboard(b, db); assert.deepEqual(bDashboard.rows.map(r => r.product.code), ['SECRET']); assert.equal(bDashboard.rows[0].point, null);
    // Database composite FKs reject cross-tenant source/product/snapshot links.
    await assert.rejects(() => db.productionDemandObservation.create({ data: { organizationId: b, importId: imported.id, market: 'OH', itemCode: 'SECRET', locationCode: 'X', locationName: 'X', sourceLineId: 'forged', date: new Date('2026-07-31'), availableOn: new Date('2026-07-31'), cases: 1, classification: 'BAILMENT', transactionStatus: 'SHIPPED' } }));
    await importProductionSource(file('2026-08-01', '2026-10-26'), { ...options, start: '2026-08-01', end: '2026-10-26', observedOn: '2026-10-26' }, db);
    const second = await refreshProductionForecast(a, db, new Date('2026-10-27T12:00:00Z')); assert.notEqual(second.id, first.id);
    const old = await db.productionForecastSnapshot.findFirstOrThrow({ where: { organizationId: a, runId: first.id, productId: p.id } }); assert.equal(Number(old.point), 90); assert.equal(Number(old.actualCases), 90); assert.ok(old.actualEvaluatedAt);
    const dashboard = await getProductionDashboard(a, db); assert.equal(dashboard.rows.find(r => r.product.id === p.id)?.point, 90); assert.equal(dashboard.rows.find(r => r.product.code === 'DIST')?.point, null);
    detail = await getProductionProduct(a, p.id, db); assert.equal(detail?.forecast?.point, 90); assert.equal(detail?.history.length, 2);
    // Actual observation content remains tenant scoped and old predictions remain immutable.
    const records = await db.productionDemandObservation.count({ where: { organizationId: b } }); assert.equal(records, 0);
    console.log(JSON.stringify({ rehearsal: 'passed', importReplay: true, overlapRejected: true, configuredDistExcluded: true, tenantIsolation: true, compositeForeignKeys: true, snapshotReplay: true, snapshotsPreserved: true, completedHorizonActual: Number(old.actualCases), forecast: 90, backtests: detail?.forecast?.locations[0].backtests.map(s => ({ method: s.method, folds: s.folds.length, wape: s.wape })), syntheticOrganizations: [a, b] }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : 'Rehearsal failed'); process.exitCode = 1; });
