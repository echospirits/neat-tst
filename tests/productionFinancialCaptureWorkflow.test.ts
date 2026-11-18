import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { syncProductionSources, type ProductionSourceOutcome } from '../lib/productionForecasting/sourceWorkflow';
import { BAILMENT_REPORT_ID, type captureOhlqBailmentReport, type recordOhlqBailmentFailure } from '../lib/ohlqBailmentReportStorage';

const now = new Date('2026-11-18T17:00:00Z');
const csvBuffer = Buffer.from('Vendor_Name,Broker_Name,Invoice_Date,Invoice_Number,PO_Create_Date,PO_Number,Transfer_Order_Number,Agency,Transfer_Order_Ship_Date,UPC_Code,Brand,Name,Category,DC_Name,Cases,Odd_Bottles,Cases_Bottles,Quoted_Case_Price,Discount,Total,Date_Paid\r\nEcho,Broker,11/17/2026,001,11/16/2026,PO001,,00001,,000100,DIST,Excluded product,Dist,,0,0,C6,$0.00,-$1.00,-$1.00,\r\n');
type CaptureInput = Parameters<typeof captureOhlqBailmentReport>[0];
type FailureInput = Parameters<typeof recordOhlqBailmentFailure>[0];

function fixture(mode: 'ok' | 'capture-db' | 'capture-invalid' | 'forecast-import' | 'forecast-refresh' | 'forecast-policy' | 'download' | 'missing-provenance' | 'wrong-scope' = 'ok', timing = { requestedAt: now, acquiredAt: '2026-11-18T17:02:00.000Z' }) {
  const events: string[] = [], logs: string[] = [], captured: CaptureInput[] = [], failed: FailureInput[] = [], forecastFailures: unknown[] = [];
  let outcome: ProductionSourceOutcome | undefined;
  const db = {
    organization: { findMany: async () => [{ id: 'org_echo_spirits', timezone: 'America/New_York', settings: { productionForecasting: { ohio: { historyStart: '2019-01-01', directInvoices: mode === 'forecast-policy' ? null : 'shipment-only' } } } }] },
    productionSourceImport: { upsert: async (input: unknown) => { forecastFailures.push(input); } },
  } as unknown as PrismaClient;
  const nativeExport = { reportIdentity: BAILMENT_REPORT_ID, parameterScope: { parameter: 'Brand' as const, values: 'all' as const }, requestedFrom: '2019-01-01', requestedTo: mode === 'wrong-scope' ? '2026-11-17' : '2026-11-18', acquiredAt: timing.acquiredAt, exportCompleted: true as const };
  const baseDownload = { csvBuffer, reportDate: '2026-11-18', filename: 'PRIVATE.csv', outputPath: '/private/PRIVATE.csv', runDate: '2026-11-18', sizeBytes: csvBuffer.length };
  const services = {
    credentials: async () => ({ username: 'PRIVATE_USERNAME', password: 'PRIVATE_PASSWORD' }),
    bailment: async (input: { fromDate: string; reportDate?: string }) => {
      events.push('download:bailment'); assert.equal(input.fromDate, '2019-01-01'); assert.equal(input.reportDate, '2026-11-18');
      if (mode === 'download') throw Error('PRIVATE_PROVIDER_RESPONSE');
      return { ...baseDownload, nativeExport: mode === 'missing-provenance' ? undefined : nativeExport };
    },
    dc: async () => { events.push('download:dc'); return baseDownload; },
    captureBailment: async (input: CaptureInput) => {
      events.push('capture'); captured.push(input);
      if (mode === 'capture-db') throw Error('PRIVATE_DATABASE_RESPONSE');
      return { status: mode === 'capture-invalid' ? 'FAILED' as const : 'SUCCEEDED' as const, replay: false, published: mode !== 'capture-invalid', reason: mode === 'capture-invalid' ? 'incomplete-export' as const : null, contentHash: 'fixture-hash', rowCount: 1 };
    },
    recordBailmentFailure: async (input: FailureInput) => { events.push('capture:failed'); failed.push(input); return { status: 'FAILED' as const, replay: false, published: false, reason: input.reason, contentHash: null, rowCount: null }; },
    importCsv: async (csv: string, input: { source: string; end: string }) => {
      events.push(`import:${input.source}`);
      if (input.source === 'BAILMENT_PO_INVOICE') {
        assert.equal(csv, csvBuffer.toString('utf8')); assert.equal(input.end, '2026-11-17');
        if (mode === 'forecast-import') throw Error('PRIVATE_FORECAST_RESPONSE');
      }
      return { id: 'batch', replay: false, rowCount: 1, excludedRows: 1 };
    },
    refresh: async () => { events.push('refresh'); if (mode === 'forecast-refresh') throw Error('PRIVATE_FORECAST_RESPONSE'); return { id: 'run', replay: false, products: 1 }; },
    operations: async () => { events.push('operations'); return { failed: 0 }; },
  } as unknown as NonNullable<Parameters<typeof syncProductionSources>[0]>['services'];
  const run = () => syncProductionSources({ db, services, now: timing.requestedAt, retrievalId: 'manual-request-1', logger: { log: line => logs.push(line), error: line => logs.push(line) }, onResult: result => { outcome = result; } });
  return { run, events, logs, captured, failed, forecastFailures, outcome: () => outcome };
}

test('native bytes are captured once before forecasting filters with actual history-through-today scope and resolved parameter', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.events, ['download:bailment', 'capture', 'import:BAILMENT_PO_INVOICE', 'download:dc', 'import:DISTRIBUTION_CENTER', 'refresh', 'operations']);
  const saved = f.captured[0];
  assert.equal(saved.csvBuffer, csvBuffer); assert.equal(saved.expectedSizeBytes, csvBuffer.length);
  assert.equal(saved.organizationId, 'org_echo_spirits'); assert.equal(saved.retrievalId, 'manual-request-1:org_echo_spirits');
  assert.equal(saved.reportIdentity, BAILMENT_REPORT_ID); assert.equal(saved.requestedFrom, '2019-01-01'); assert.equal(saved.requestedTo, '2026-11-18');
  assert.equal(saved.timezone, 'America/New_York'); assert.deepEqual(saved.parameterScope, { parameter: 'Brand', values: 'all' });
  assert.equal(saved.requestedAt.toISOString(), now.toISOString()); assert.equal(saved.acquiredAt.toISOString(), '2026-11-18T17:02:00.000Z');
  assert.equal(f.outcome()?.capturedFinancialReports, 1); assert.deepEqual(f.outcome()?.failedSources, []);
});

test('a native download crossing organization midnight keeps the actual requested range tied to its request identity', async () => {
  const timing = { requestedAt: new Date('2026-11-19T04:59:58.000Z'), acquiredAt: '2026-11-19T05:02:00.000Z' };
  const f = fixture('ok', timing); await f.run();
  assert.equal(f.captured[0].requestedAt.toISOString(), timing.requestedAt.toISOString());
  assert.equal(f.captured[0].requestedTo, '2026-11-18', 'the native To control used the organization day at request creation');
  assert.equal(f.captured[0].acquiredAt.toISOString(), timing.acquiredAt, 'actual acquisition remains the following local day');
  assert.equal(f.outcome()?.capturedFinancialReports, 1); assert.deepEqual(f.outcome()?.failedSources, []);
});

for (const mode of ['capture-db', 'capture-invalid', 'missing-provenance', 'wrong-scope'] as const) {
  test(`${mode} exposes capture failure after forecasting and unrelated work continue`, async () => {
    const f = fixture(mode); await assert.rejects(f.run(), /BAILMENT_FINANCIAL_CAPTURE/);
    assert.ok(f.events.includes('import:BAILMENT_PO_INVOICE')); assert.ok(f.events.includes('import:DISTRIBUTION_CENTER')); assert.ok(f.events.includes('refresh')); assert.ok(f.events.includes('operations'));
    assert.equal(f.outcome()?.importedSources, 2); assert.deepEqual(f.outcome()?.failedSources, ['BAILMENT_FINANCIAL_CAPTURE']);
    assert.equal(f.outcome()?.capturedFinancialReports, 0);
    if (mode !== 'capture-invalid') assert.equal(f.failed[0].reason, mode === 'capture-db' ? 'persistence' : 'provenance');
    assert.doesNotMatch(JSON.stringify([f.logs, f.failed, f.forecastFailures]), /PRIVATE_|Vendor_Name|Excluded product/);
  });
}

for (const mode of ['forecast-import', 'forecast-refresh', 'forecast-policy'] as const) {
  test(`${mode} leaves the independently captured financial report available and reports both outcomes`, async () => {
    const f = fixture(mode); await assert.rejects(f.run(), /Production source failures/);
    assert.equal(f.captured.length, 1); assert.equal(f.failed.length, 0);
    assert.equal(f.outcome()?.capturedFinancialReports, 1); assert.ok(!f.outcome()?.failedSources.includes('BAILMENT_FINANCIAL_CAPTURE'));
    assert.ok(f.events.includes('import:DISTRIBUTION_CENTER')); assert.ok(f.events.includes('operations'));
    assert.doesNotMatch(JSON.stringify([f.logs, f.forecastFailures]), /PRIVATE_|no source facts were changed/);
    if (mode === 'forecast-import') assert.match(JSON.stringify(f.forecastFailures), /independently saved financial reports/);
  });
}

test('download failure records safe native capture attempt metadata without preventing DC and forecast work', async () => {
  const f = fixture('download'); await assert.rejects(f.run(), /BAILMENT_FINANCIAL_CAPTURE/);
  assert.equal(f.captured.length, 0); assert.equal(f.failed[0].reason, 'download');
  assert.equal(f.failed[0].requestedFrom, '2019-01-01'); assert.equal(f.failed[0].requestedTo, '2026-11-18');
  assert.ok(f.events.includes('import:DISTRIBUTION_CENTER')); assert.ok(f.events.includes('refresh')); assert.ok(f.events.includes('operations'));
  assert.doesNotMatch(JSON.stringify([f.logs, f.failed]), /PRIVATE_/);
});
