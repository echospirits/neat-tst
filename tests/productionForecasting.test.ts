import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { backtest, forecastLocation, forecastProduct, predict, scoreFolds, selectModel, valuesKnownAt } from '../lib/productionForecasting/engine';
import { days, forecastConfiguration, forecastRules, includedInDemand, previousYear, priorYearDays, sum, type DemandSeries, type ForecastProduct } from '../lib/productionForecasting/model';
import { ohioClassification, parseProductionSource, SOURCE_HEADERS, type ImportOptions } from '../lib/productionForecasting/import';
import { classificationForItem, normalizeNativeOhio, type OhioItemContext } from '../lib/productionForecasting/ohio';
import { summaryFor } from '../lib/productionForecasting/service';
import { ForecastTable } from '../app/analytics/production/ForecastTable';
import { ForecastDetail } from '../app/analytics/production/ForecastDetail';
import { FEATURE_REGISTRY, getEnvironmentFeatureKeys, getPackageFeatureKeys } from '../lib/featureRegistry';

const product: ForecastProduct = { id: 'product-a', market: 'OH', code: '2847B', name: 'Rum' };
const asOf = '2026-10-26';
export function demandSeries(location = 'GPT', from = '2024-01-01', through = asOf, value: (date: string, i: number) => number = () => 2): DemandSeries {
  return { market: 'OH', itemCode: product.code, location: { code: location, name: location }, coverage: [{ start: from, end: through }], observations: days(from, through).map((date, i) => ({ date, availableOn: date, cases: value(date, i), classification: 'A3A_BAIL' })) };
}
test('Bailment and A3a Bail are included; structured A3a Dist and recognized native aliases are excluded', () => {
  for (const c of ['BAILMENT', 'A3A_BAIL', 'OTHER_OUTBOUND'] as const) assert.equal(includedInDemand(c), true);
  assert.equal(includedInDemand('A3A_DIST'), false);
  assert.equal(ohioClassification(' A-3a Bail '), 'A3A_BAIL');
  assert.equal(ohioClassification('A3A Bailment'), 'A3A_BAIL');
  assert.equal(ohioClassification('A3A Distillery Only'), 'A3A_DIST');
  assert.equal(ohioClassification('A-3a Dist'), 'A3A_DIST');
  assert.throws(() => ohioClassification('not A3A Dist'));
  const s = demandSeries(); s.observations.push({ date: asOf, availableOn: asOf, cases: 50000, classification: 'A3A_DIST' });
  assert.equal(valuesKnownAt(s, asOf).get(asOf), 2);
});
test('30-day forecasts have five buckets and roll up every included fulfillment location', () => {
  const r = forecastProduct(product, [demandSeries('GPT'), demandSeries('GRN'), demandSeries('BAIL-STORE')], [], asOf);
  assert.equal(r.start, '2026-10-27'); assert.equal(r.end, '2026-11-25'); assert.equal(r.point, 180);
  assert.equal(r.buckets.length, 5); assert.equal(r.buckets[4].end, r.end);
  assert.ok(Math.abs(sum(r.buckets.map(b => b.cases)) - r.point!) < 0.05);
  assert.equal(r.point, sum(r.locations.map(l => l.point!)));
  assert.ok(r.target! >= r.point! && r.lower! <= r.point! && r.upper! >= r.point!);
});
test('seasonal shape, recent rate, damped growth and long trend affect candidates without extreme extrapolation', () => {
  const seasonal = demandSeries('GPT', '2024-01-01', asOf, d => d.slice(5, 7) === '11' ? 6 : 2);
  const v = valuesKnownAt(seasonal, asOf);
  const s = predict('seasonal-growth', v, asOf, '2026-10-27')!;
  assert.ok(s.slice(7).every(n => n > s[0]));
  const stable = demandSeries(); const up = demandSeries('GPT', '2024-01-01', asOf, d => d > '2026-07-27' ? 3 : 2);
  assert.ok(sum(predict('weighted-mean', valuesKnownAt(up, asOf), asOf, '2026-10-27')!) > sum(predict('weighted-mean', valuesKnownAt(stable, asOf), asOf, '2026-10-27')!));
  assert.ok(sum(predict('seasonal-growth', valuesKnownAt(up, asOf), asOf, '2026-10-27')!) > 60);
  const huge = demandSeries('GPT', '2024-01-01', asOf, d => d > '2026-09-26' ? 1000 : 2);
  assert.ok(sum(predict('seasonal-growth', valuesKnownAt(huge, asOf), asOf, '2026-10-27')!) < 30000);
});
test('sparse, intermittent, missing, known zero and stale sources remain distinct', () => {
  const sparse = forecastLocation(demandSeries('GPT', '2026-10-20'), asOf);
  assert.equal(sparse.point, null); assert.equal(sparse.confidence, 'Low');
  const fallback = forecastLocation(demandSeries('GPT', '2026-10-01'), asOf);
  assert.equal(fallback.point, 60); assert.equal(fallback.confidence, 'Low'); assert.match(fallback.rangeMethod, /Uncalibrated/);
  const zero = forecastLocation(demandSeries('GPT', '2026-01-01', asOf, () => 0), asOf);
  assert.equal(zero.point, 0); assert.equal(zero.backtests[0].wape, null); assert.equal(zero.backtests[0].mase, null);
  const intermittent = demandSeries('GPT', '2024-01-01', asOf, (_, i) => i % 20 ? 0 : 12);
  const r = forecastLocation(intermittent, asOf); assert.ok(Number.isFinite(r.point)); assert.ok(r.backtests.find(b => b.method === 'croston-sba')!.folds.length > 0);
  const missing = demandSeries(); missing.coverage = [{ start: '2024-01-01', end: '2026-10-20' }, { start: '2026-10-22', end: asOf }];
  assert.equal(valuesKnownAt(missing, asOf).has('2026-10-21'), false);
  assert.equal(forecastLocation(missing, asOf).point, null);
  assert.equal(forecastLocation(demandSeries('GPT', '2024-01-01', '2026-09-01'), asOf).point, null);
  assert.equal(forecastProduct(product, [], [], asOf).point, null);
});
test('backtests train only on known dates/postings; future observations cannot change earlier predictions', () => {
  const a = demandSeries(), b = demandSeries();
  b.observations.push({ date: '2026-05-01', availableOn: '2026-10-25', cases: 999999, classification: 'BAILMENT' });
  b.observations.push({ date: '2027-01-01', availableOn: '2027-01-01', cases: 999999, classification: 'BAILMENT' });
  const cutoff = '2026-09-01';
  assert.deepEqual(valuesKnownAt(a, cutoff), valuesKnownAt(b, cutoff));
  assert.deepEqual(backtest(a, cutoff), backtest(b, cutoff));
  const scores = backtest(a, asOf);
  for (const score of scores) for (const fold of score.folds) assert.ok(fold.origin < asOf);
  assert.equal(selectModel(scores, ['recent-mean', 'weighted-mean', 'seasonal-naive']), selectModel(scores, ['recent-mean', 'weighted-mean', 'seasonal-naive']));
});
test('WAPE, MASE and signed bias calculate correctly; unequal fold counts cannot cherry-pick', () => {
  const score = scoreFolds('recent-mean', [{ origin: '2026-01-01', predicted: 40, actual: 30, error: -10, scale: 2 }, { origin: '2026-02-01', predicted: 50, actual: 60, error: 10, scale: 2 }]);
  assert.equal(score.mae, 10); assert.equal(score.wape, 20 / 90); assert.equal(score.mase, 1 / 6); assert.equal(score.bias, 0);
  const unluckyBaseline = { ...score, folds: [...score.folds, { ...score.folds[0], origin: '2026-03-01' }] };
  const luckySeasonal = scoreFolds('seasonal-naive', [{ ...score.folds[0], predicted: 30, error: 0 }]);
  assert.equal(selectModel([unluckyBaseline, luckySeasonal], ['recent-mean', 'weighted-mean', 'seasonal-naive']), 'recent-mean');
});
test('guidance never overrides demand, missing guidance never becomes zero, and configured exclusions cannot leak', () => {
  const series = [demandSeries()];
  const baseline = forecastProduct(product, series, [], asOf);
  const r = forecastProduct(product, series, [{ market: 'OH', itemCode: product.code, location: { code: 'GPT', name: 'Groveport' }, date: asOf, minimum: 999, maximum: 9999, classification: 'A3A_BAIL' }], asOf);
  assert.equal(r.point, baseline.point); assert.equal(r.guidance.length, 1); assert.equal(summaryFor(baseline).guidanceMinimum, null);
  assert.equal(forecastProduct({ ...product, demandExcluded: true }, series, r.guidance, asOf).point, null);
  assert.equal(forecastProduct(product, [{ ...demandSeries(), itemCode: 'FOREIGN' }], [], asOf).point, null);
  const partial = forecastProduct(product, [demandSeries(), demandSeries('GRN', '2026-10-25')], [], asOf);
  assert.equal(partial.point, null); assert.equal(partial.target, null);
});
test('safety configuration is bounded, transparent and independent of inventory; leap comparison stays valid', () => {
  const config = forecastConfiguration({ productionForecasting: { safety: { High: 0.12, Medium: 2, Low: -1 } } });
  assert.equal(config.safety.High, 0.12); assert.equal(config.safety.Medium, 0.1); assert.equal(config.safety.Low, 0.15);
  const r = forecastProduct(product, [demandSeries()], [], asOf, null, config);
  assert.equal(r.target, Math.ceil(r.point! * (1 + config.safety[r.confidence])));
  assert.equal(previousYear('2024-02-29'), '2023-02-28');
  assert.equal(new Set(priorYearDays('2024-02-20', 30)).size, 30);
});

test('classified Distillery Only locations are omitted and guidance-only locations expose missing demand', () => {
  const included = demandSeries();
  const excluded = { ...demandSeries('DIST'), classification: 'A3A_DIST' as const };
  const result = forecastProduct(product, [included, excluded], [], asOf);
  assert.equal(result.locations.length, 1); assert.equal(result.point, 60);
  const missing = forecastProduct(product, [included], [{ market: 'OH', itemCode: product.code, location: { code: 'GRN', name: 'Green' }, date: '2026-10-27', minimum: 0, maximum: 0, classification: 'BAILMENT' }], asOf);
  assert.equal(missing.locations.length, 2); assert.equal(missing.point, null);
  assert.equal(missing.locations[1].point, null); assert.equal(missing.guidance.length, 1);
});

test('scheduled refresh requires its secret and respects the existing disabled cron policy', async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'forecast-unit-test-secret';
  try {
    const { GET } = await import('../app/api/cron/production-forecasting/route');
    assert.equal((await GET(new Request('http://localhost/api/cron/production-forecasting'))).status, 401);
    const response = await GET(new Request('http://localhost/api/cron/production-forecasting', { headers: { authorization: 'Bearer forecast-unit-test-secret' } }));
    assert.deepEqual(await response.json(), { status: 'disabled' });
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});

const options: ImportOptions = { organizationId: 'org_echo_spirits', market: 'OH', source: 'BAILMENT_PO_INVOICE', start: '2026-10-01', end: '2026-10-20', observedOn: '2026-10-21', complete: true };
const csv = SOURCE_HEADERS.BAILMENT_PO_INVOICE.join(',') + '\ni1,2026-10-13,2026-10-13,2847B,GPT,Groveport,A3A Bailment,SHIPPED,1.5';
test('strict source contract preserves cases, status, coverage and idempotent identity; incomplete input is rejected', () => {
  const r = parseProductionSource(csv, options); assert.equal(r.rows[0].cases, 1.5); assert.equal(r.scopes.length, 1); assert.equal(r.excludedRows, 0);
  assert.equal(r.hash, parseProductionSource(csv, options).hash);
  assert.equal(parseProductionSource(csv.replace('A3A Bailment', 'A3A Dist'), options).excludedRows, 1);
  for (const bad of [csv.replace('SHIPPED', 'PENDING'), csv.replace('1.5', '-1'), csv.replace('2026-10-13,2026-10-13', '2026-02-30,2026-10-13'), csv + '\ni1,2026-10-13,2026-10-13,2847B,GPT,Groveport,A3A Bailment,SHIPPED,1']) assert.throws(() => parseProductionSource(bad, options));
  assert.throws(() => parseProductionSource(csv, { ...options, complete: false }));
  assert.throws(() => parseProductionSource(csv, { ...options, market: 'KY' }));
});
const context: OhioItemContext = { included: new Set(['2847B', 'DIST']), distilleryOnly: new Set(['DIST']), bailment: new Set(['2847B']) };
test('native Bailment mapping uses shipped invoices, portfolio classification, generic DC location and odd-bottle case equivalents', () => {
  const headers = 'Vendor_Name\tBroker_Name\tInvoice_Date\tInvoice_Number\tPO_Create_Date\tPO_Number\tTransfer_Order_Number\tAgency\tTransfer_Order_Ship_Date\tUPC_Code\tBrand\tName\tCategory\tDC_Name\tCases\tOdd_Bottles\tCases_Bottles\tQuoted_Case_Price\tDiscount\tTotal\tDate_Paid';
  const row = 'ETOHIO LLC-50\tBEVERAGE DISTRIBUTORS INC\t10/12/2026\tPINV001664901\t10/8/2026\tDPOE1151331\tTO000458836\t30733\t10/13/2026\t8.60002E+11\t2847B\tECHO RUM\tRum\tGPT\t1\t3\tC6\t$138.97\t$0.00\t$138.97\t';
  const normalized = normalizeNativeOhio(headers + '\n' + row, options.source, context)!;
  const r = parseProductionSource(normalized.csv, options); assert.equal(r.rows[0].cases, 1.5); assert.equal(r.rows[0].date, '2026-10-13'); assert.equal(r.rows[0].availableOn, '2026-10-13'); assert.equal(r.rows[0].classification, 'A3A_BAIL'); assert.equal(r.rows[0].locationCode, 'GPT');
  assert.equal(normalized.evidence.get(r.rows[0].sourceLineId)?.PO_Number, 'DPOE1151331');
  assert.equal(classificationForItem('DIST', context), 'A3A_DIST');
  assert.throws(() => normalizeNativeOhio(headers + '\n' + row.replace('10/13/2026', ''), options.source, context), /shipped invoice/);
  assert.throws(() => normalizeNativeOhio(headers + '\n' + row.replace('C6', '?'), options.source, context), /case pack/);
});
test('native DC mapping separates both warehouse guidance observations and preserves a true zero', () => {
  const native = 'Code,Product Name,Vendor,Status Code,Category,Groveport - MAX (45 Days),Groveport - Cases On Hand,Groveport - MIN (14 Days),Green - MAX (45 Days),Green - MIN (14 Days)\n2847B,Rum,Echo,70,Rum,45,10,14,0,0';
  const normalized = normalizeNativeOhio(native, 'DISTRIBUTION_CENTER', context)!;
  const r = parseProductionSource(normalized.csv, { ...options, source: 'DISTRIBUTION_CENTER' });
  assert.equal(r.rows.length, 2); assert.equal(r.rows[0].maximum, 45); assert.equal(r.rows[0].minimum, 14); assert.equal(r.rows[1].minimum, 0);
  assert.equal(r.rows[1].locationCode, 'GRN');
});
test('pilot is off by default and TST broad overrides cannot enroll other tenants', () => {
  assert.equal(FEATURE_REGISTRY.PRODUCTION_FORECASTING.defaultEnabled, false);
  assert.equal(getPackageFeatureKeys(true).includes('PRODUCTION_FORECASTING'), false);
  assert.equal(getEnvironmentFeatureKeys([], { APP_ENV: 'test' }).includes('PRODUCTION_FORECASTING'), false);
  assert.equal(getEnvironmentFeatureKeys(['PRODUCTION_FORECASTING'], { APP_ENV: 'test' }).includes('PRODUCTION_FORECASTING'), true);
});
test('rendered dashboard and drill-down use the same saved totals, freshness, guidance and unavailable states', () => {
  const r = forecastProduct(product, [demandSeries()], [], asOf);
  const table = renderToStaticMarkup(createElement(ForecastTable, { rows: [summaryFor(r)] }));
  const detail = renderToStaticMarkup(createElement(ForecastDetail, { forecast: r }));
  assert.match(table, /60 forecast cases/); assert.match(table, /30-day forecast/); assert.match(table, /Not imported/);
  assert.match(detail, /60 cases/); assert.match(detail, /Forecast data through 2026-10-26/); assert.match(detail, /Why this forecast/);
  assert.match(detail, /finished inventory/i); assert.match(detail, /Distribution Center guidance/);
  const empty = renderToStaticMarkup(createElement(ForecastTable, { rows: [] })); assert.match(empty, /No eligible products/);
});
