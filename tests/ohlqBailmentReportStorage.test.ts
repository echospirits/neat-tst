import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { BAILMENT_HEADERS, BAILMENT_REPORT_ID, BAILMENT_RUN_RETENTION, captureOhlqBailmentReport, getCurrentOhlqBailmentReport, getOhlqBailmentReportStatus, recordOhlqBailmentFailure, validateNativeBailmentCsv, type BailmentCaptureInput } from '../lib/ohlqBailmentReportStorage';

// A small transactional database double exercises the service boundary. The
// additive migration and real PostgreSQL constraints are checked separately.
function database() {
  type Row = Record<string, any>;
  let data: { payloads: Row[]; runs: Row[]; states: Row[] } = { payloads: [], runs: [], states: [] };
  let count = 0, failPublish = false;
  const find = (rows: Row[], key: Row) => rows.find(row => Object.entries(key).every(([name, value]) => row[name] === value));
  const sortedRuns = (organizationId: string) => data.runs.filter(row => row.organizationId === organizationId).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime() || b.retrievalId.localeCompare(a.retrievalId));
  const scoped = (key: Row) => key.organizationId_retrievalId ?? key.organizationId_contentHash ?? key.organizationId_id ?? key;
  const tx = {
    $executeRaw: async () => 1,
    organization: { findFirst: async ({ where }: Row) => ['org-a', 'org-b'].includes(where.id) ? { id: where.id, timezone: 'America/New_York', settings: { productionForecasting: { ohio: { historyStart: '2019-01-01' } } } } : null },
    ohlqBailmentReportPayload: {
      findUniqueOrThrow: async ({ where }: Row) => { const row = find(data.payloads, scoped(where)); assert.ok(row); return row; },
      upsert: async ({ where, create }: Row) => { const existing = find(data.payloads, scoped(where)); if (existing) return existing; const created: Row = { id: `payload-${++count}`, ...create }; data.payloads.push(created); return created; },
      deleteMany: async ({ where }: Row) => { data.payloads = data.payloads.filter(row => row.organizationId !== where.organizationId || where.id.notIn.includes(row.id)); },
    },
    ohlqBailmentReportRetrieval: {
      findUnique: async ({ where }: Row) => find(data.runs, scoped(where)) ?? null,
      create: async ({ data: row }: Row) => { const created = { ...row, parameterScope: { values: row.parameterScope.values, parameter: row.parameterScope.parameter }, completedAt: new Date('2026-11-18T23:00:00Z') }; data.runs.push(created); return created; },
      findFirst: async ({ where }: Row) => sortedRuns(where.organizationId)[0] ?? null,
      findMany: async ({ where, take }: Row) => sortedRuns(where.organizationId).slice(0, take),
      deleteMany: async ({ where }: Row) => { data.runs = data.runs.filter(row => row.organizationId !== where.organizationId || where.retrievalId.notIn.includes(row.retrievalId)); },
    },
    ohlqBailmentReportState: {
      findUnique: async ({ where, include, select }: Row) => {
        const row = find(data.states, where); if (!row) return null;
        return { ...row, ...((include?.currentRetrieval || select?.currentRetrieval) ? { currentRetrieval: find(data.runs, { organizationId: row.organizationId, retrievalId: row.currentRetrievalId }) } : {}), ...(include?.currentPayload ? { currentPayload: find(data.payloads, { organizationId: row.organizationId, id: row.currentPayloadId }) } : {}) };
      },
      upsert: async ({ where, create, update }: Row) => { if (failPublish) throw new Error('simulated-database-failure'); const row = find(data.states, where); if (row) { Object.assign(row, update); return row; } data.states.push(create); return create; },
      update: async ({ where, data: values }: Row) => { const row = find(data.states, where); assert.ok(row); Object.assign(row, values); return row; },
    },
  };
  const db = { ...tx, $transaction: async (work: (value: typeof tx) => Promise<unknown>) => { const before = structuredClone(data); try { return await work(tx); } catch (error) { data = before; throw error; } } } as unknown as PrismaClient;
  return { db, snapshot: () => data, failPublish: () => { failPublish = true; } };
}

function row(overrides: Partial<Record<typeof BAILMENT_HEADERS[number], string>> = {}) {
  const base: Record<typeof BAILMENT_HEADERS[number], string> = { Vendor_Name: 'Synthetic Vendor', Broker_Name: '', Invoice_Date: '01/03/2020', Invoice_Number: '00001aB', PO_Create_Date: '01/01/2020', PO_Number: '00007', Transfer_Order_Number: '00008', Agency: '00001', Transfer_Order_Ship_Date: '', UPC_Code: '000012345678', Brand: '3150B', Name: 'Rum, aged\nSpecial "batch"', Category: 'Rum', DC_Name: 'GPT', Cases: '0', Odd_Bottles: '0', Cases_Bottles: 'C6', Quoted_Case_Price: '100.10', Discount: '0', Total: '0.00', Date_Paid: '' };
  return BAILMENT_HEADERS.map(header => ({ ...base, ...overrides })[header]);
}
const quote = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
function fixture(rows = [row(), row({ UPC_Code: '000098765432', Cases: '-1', Quoted_Case_Price: '10.01', Discount: '-0.02', Total: '-10.03' }), row({ Invoice_Number: '00001aB', Brand: 'OUTSIDE-FORECAST', Cases: '1', Total: '123.45', Date_Paid: '11/17/2026' })]) {
  return Buffer.from('\uFEFF' + [BAILMENT_HEADERS.join(','), ...rows.map(values => values.map(quote).join(','))].join('\r\n') + '\r\n', 'utf8');
}
function input(retrievalId: string, csvBuffer = fixture(), minute = 0, organizationId = 'org-a'): BailmentCaptureInput {
  return { organizationId, retrievalId, requestedAt: new Date(Date.UTC(2026, 10, 18, 12, minute)), acquiredAt: new Date(Date.UTC(2026, 10, 18, 12, minute, 30)), requestedFrom: '2019-01-01', requestedTo: '2026-11-18', timezone: 'America/New_York', reportIdentity: BAILMENT_REPORT_ID, parameterScope: { parameter: 'Vendor', values: 'all' }, exportCompleted: true, csvBuffer, expectedSizeBytes: csvBuffer.length };
}
const cents = (value: string) => { const match = /^(-?)(\d+)\.(\d{2})$/.exec(value)!; return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt(match[3])); };

test('initial native capture round-trips bytes, source fields, duplicate invoice lines and exact financial totals', async () => {
  const store = database(), original = fixture();
  assert.equal((await captureOhlqBailmentReport(input('first', original), store.db)).status, 'SUCCEEDED');
  const saved = await getCurrentOhlqBailmentReport('org-a', store.db); assert.ok(saved);
  assert.deepEqual(saved.csvBuffer, original);
  const before = validateNativeBailmentCsv(original), after = validateNativeBailmentCsv(saved.csvBuffer);
  assert.equal(after.rowCount, 3); assert.deepEqual(after.rows, before.rows);
  assert.equal(after.rows[0][3], '00001aB'); assert.equal(after.rows[0][9], '000012345678');
  assert.equal(after.rows[0][20], ''); assert.equal(after.rows[0][14], '0'); assert.equal(after.rows[1][14], '-1'); assert.equal(after.rows[2][10], 'OUTSIDE-FORECAST');
  assert.equal(after.rows.reduce((total, values) => total + cents(values[19]), 0n), 11342n);
  assert.equal(before.rows.reduce((total, values) => total + cents(values[19]), 0n), 11342n);
  assert.equal(saved.metadata.requestedTo, '2026-11-18'); assert.equal(saved.metadata.status, 'SUCCEEDED');
});

test('payment-only and each price/discount/total-only revision produce distinct durable content', async () => {
  for (const [field, value] of [['Date_Paid', '11/18/2026'], ['Quoted_Case_Price', '101.01'], ['Discount', '-1.01'], ['Total', '-1.01']] as const) {
    const store = database(), initial = fixture([row()]);
    const first = await captureOhlqBailmentReport(input('a', initial), store.db);
    const revised = fixture([row({ [field]: value })]);
    const next = await captureOhlqBailmentReport(input('b', revised, 1), store.db);
    assert.notEqual(next.contentHash, first.contentHash); assert.equal(store.snapshot().payloads.length, 2);
    assert.deepEqual((await getCurrentOhlqBailmentReport('org-a', store.db))?.csvBuffer, revised);
  }
});

test('identical new downloads advance freshness without copying payload or evicting previous distinct content; replay is inert', async () => {
  const store = database();
  await captureOhlqBailmentReport(input('a'), store.db);
  const changed = fixture([row({ Date_Paid: '11/18/2026' })]);
  await captureOhlqBailmentReport(input('b', changed, 1), store.db);
  const previous = store.snapshot().states[0].previousPayloadId;
  const attempt = input('c', changed, 2), result = await captureOhlqBailmentReport(attempt, store.db);
  assert.equal(result.published, true); assert.equal(store.snapshot().payloads.length, 2);
  assert.equal(store.snapshot().states[0].previousPayloadId, previous);
  assert.equal((await getOhlqBailmentReportStatus('org-a', store.db)).current?.retrievalId, 'c');
  assert.equal((await captureOhlqBailmentReport(attempt, store.db)).replay, true);
  assert.equal(store.snapshot().runs.length, 3);
  await assert.rejects(captureOhlqBailmentReport(input('c', fixture(), 2), store.db), /identity was reused/);
  assert.equal(store.snapshot().runs.length, 3);
});

test('invalid, empty, schema-changed and detectably truncated exports preserve current bytes and expose a safe failure', async () => {
  const store = database(); await captureOhlqBailmentReport(input('good'), store.db);
  const bad = [Buffer.alloc(0), Buffer.from('<html>private-login</html>'), Buffer.from(BAILMENT_HEADERS.join(',') + '\r\n'), Buffer.from(BAILMENT_HEADERS.join(',') + '\r\n"unterminated'), Buffer.from(BAILMENT_HEADERS.join(',') + '\r\nshort,row'), Buffer.from('Unrecognized,' + BAILMENT_HEADERS.join(',')), fixture([BAILMENT_HEADERS.map(() => '')])];
  for (let i = 0; i < bad.length; i++) {
    const outcome = await captureOhlqBailmentReport(input(`bad-${i}`, bad[i], i + 1), store.db);
    assert.equal(outcome.status, 'FAILED'); assert.deepEqual((await getCurrentOhlqBailmentReport('org-a', store.db))?.csvBuffer, fixture());
  }
  const status = await getOhlqBailmentReportStatus('org-a', store.db);
  assert.equal(status.current?.retrievalId, 'good'); assert.equal(status.latestAttempt?.status, 'FAILED');
  assert.doesNotMatch(JSON.stringify(status), /private-login/);
  assert.equal((await captureOhlqBailmentReport({ ...input('size-mismatch', fixture(), 10), expectedSizeBytes: 1 }, store.db)).reason, 'incomplete-export');
  assert.equal((await captureOhlqBailmentReport({ ...input('not-completed', fixture(), 11), exportCompleted: false }, store.db)).reason, 'provenance');
});

test('scope and range provenance fail closed while ordinary corrections remain accepted', async () => {
  const store = database();
  for (const [name, changed] of [['report', { reportIdentity: 'other-report' }], ['from', { requestedFrom: '2020-01-01' }], ['future', { requestedTo: '2026-11-19' }], ['timezone', { timezone: 'America/Chicago' }]] as const) {
    assert.equal((await captureOhlqBailmentReport({ ...input(name), ...changed }, store.db)).reason, 'scope-mismatch');
  }
  const history = Array.from({ length: 20 }, (_, index) => row({ Invoice_Number: String(index).padStart(6, '0'), Invoice_Date: index < 10 ? '01/03/2020' : '02/03/2020' }));
  await captureOhlqBailmentReport(input('history', fixture(history), 1), store.db);
  assert.equal((await captureOhlqBailmentReport(input('correction', fixture(history.slice(1)), 2), store.db)).status, 'SUCCEEDED');
  assert.equal((await captureOhlqBailmentReport(input('catastrophic', fixture(history.slice(15)), 3), store.db)).reason, 'incomplete-export');
  assert.equal((await getCurrentOhlqBailmentReport('org-a', store.db))?.metadata.rowCount, 19);
});

test('failed native CSV captures persist structural diagnostics without source fields or row contents', async () => {
  const store = database(); await captureOhlqBailmentReport(input('good'), store.db);
  const complete = fixture([row({ Invoice_Number: 'PRIVATE-INVOICE-MARKER', Name: 'PRIVATE-PRODUCT-MARKER' })]);
  const interiorBlank = Buffer.from(complete.toString('utf8') + '\r\n' + row().map(quote).join(',') + '\r\n');
  assert.equal((await captureOhlqBailmentReport(input('interior-blank', interiorBlank, 1), store.db)).reason, 'incomplete-export');
  const terminal = (await getOhlqBailmentReportStatus('org-a', store.db)).latestAttempt?.validation as Record<string, any>;
  assert.equal(terminal.diagnostics.stage, 'row-shape');
  assert.equal(terminal.diagnostics.parsedDataRecordCount, 3); assert.equal(terminal.diagnostics.expectedColumnCount, 21);
  assert.equal(terminal.diagnostics.trailingEmptyRecordCount, 0); assert.equal(terminal.diagnostics.mismatchingRecordCount, 1);
  assert.equal(terminal.diagnostics.firstMismatchingDataRecord, 2); assert.deepEqual(terminal.diagnostics.fieldCountGroups, [{ fieldCount: 1, recordCount: 1 }]);
  assert.equal(terminal.diagnostics.byteCount, interiorBlank.length); assert.equal(terminal.diagnostics.expectedByteCount, interiorBlank.length);
  assert.doesNotMatch(JSON.stringify(terminal), /PRIVATE-INVOICE-MARKER|PRIVATE-PRODUCT-MARKER/);
  const unclosed = Buffer.from(BAILMENT_HEADERS.join(',') + '\r\n"PRIVATE-UNCLOSED-MARKER');
  await captureOhlqBailmentReport(input('unclosed-quote', unclosed, 2), store.db);
  const quoted = (await getOhlqBailmentReportStatus('org-a', store.db)).latestAttempt?.validation as Record<string, any>;
  assert.equal(quoted.diagnostics.stage, 'csv-unclosed-quote'); assert.equal(quoted.diagnostics.completeRecordCount, 1);
  assert.equal(quoted.diagnostics.openingQuoteCharacterOffset, BAILMENT_HEADERS.join(',').length + 2);
  assert.equal(quoted.diagnostics.endCharacterOffset, unclosed.length); assert.doesNotMatch(JSON.stringify(quoted), /PRIVATE-UNCLOSED-MARKER/);
  await captureOhlqBailmentReport({ ...input('size-mismatch', complete, 3), expectedSizeBytes: complete.length + 10 }, store.db);
  const size = (await getOhlqBailmentReportStatus('org-a', store.db)).latestAttempt?.validation as Record<string, any>;
  assert.equal(size.diagnostics.stage, 'buffer-size'); assert.equal(size.diagnostics.byteCount, complete.length); assert.equal(size.diagnostics.expectedByteCount, complete.length + 10);
  assert.deepEqual((await getCurrentOhlqBailmentReport('org-a', store.db))?.csvBuffer, fixture(), 'diagnostics never promote malformed content');
});

test('native terminal empty physical records preserve original bytes and do not inflate financial data-row count', async () => {
  const store = database();
  const original = Buffer.from(fixture().toString('utf8') + '\r\n');
  const parsed = validateNativeBailmentCsv(original, original.length);
  assert.equal(parsed.rowCount, 3); assert.equal(parsed.trailingEmptyRecordCount, 1);
  assert.equal((await captureOhlqBailmentReport(input('native-terminal-empty', original), store.db)).status, 'SUCCEEDED');
  const saved = await getCurrentOhlqBailmentReport('org-a', store.db); assert.ok(saved);
  assert.deepEqual(saved.csvBuffer, original); assert.equal(saved.metadata.rowCount, 3);
  assert.equal((saved.metadata.validation as Record<string, any>).trailingEmptyRecordCount, 1);
  assert.equal(validateNativeBailmentCsv(saved.csvBuffer).rows.reduce((total, values) => total + cents(values[19]), 0n), 11342n);
  const blankDataRow = BAILMENT_HEADERS.map(() => '');
  const withBlankValues = Buffer.from(fixture([row(), blankDataRow]).toString('utf8') + '\r\n');
  assert.equal(validateNativeBailmentCsv(withBlankValues).rowCount, 2, 'a complete row of blank source fields is retained');
  const shortTerminal = Buffer.from(fixture().toString('utf8') + 'short,row\r\n\r\n');
  assert.throws(() => validateNativeBailmentCsv(shortTerminal), /incomplete-export/);
  const quotedEmptyTerminal = Buffer.from(fixture().toString('utf8') + '""\r\n\r\n');
  assert.throws(() => validateNativeBailmentCsv(quotedEmptyTerminal), /incomplete-export/, 'a quoted empty field is a short source record, not a physical blank line');
});

test('out-of-order requests cannot replace the newer successful snapshot, including deterministic equal-time ordering', async () => {
  const store = database(), newerBytes = fixture([row({ Date_Paid: '11/18/2026' })]);
  await captureOhlqBailmentReport(input('newer', newerBytes, 10), store.db);
  assert.equal((await captureOhlqBailmentReport(input('older', fixture(), 0), store.db)).published, false);
  assert.deepEqual((await getCurrentOhlqBailmentReport('org-a', store.db))?.csvBuffer, newerBytes);
  assert.equal(store.snapshot().payloads.length, 2, 'late first previous distinct version is retained');
  await captureOhlqBailmentReport(input('zzz', newerBytes, 10), store.db);
  assert.equal((await captureOhlqBailmentReport(input('aaa', fixture(), 10), store.db)).published, false);
  assert.equal((await getCurrentOhlqBailmentReport('org-a', store.db))?.metadata.retrievalId, 'zzz');
});

test('transaction publication failure leaves neither a partial current pointer nor orphan bytes/run', async () => {
  const store = database(); await captureOhlqBailmentReport(input('good'), store.db);
  store.failPublish();
  await assert.rejects(captureOhlqBailmentReport(input('broken', fixture([row()]), 1), store.db), /simulated-database-failure/);
  assert.equal(store.snapshot().runs.length, 1); assert.equal(store.snapshot().payloads.length, 1);
  assert.equal((await getCurrentOhlqBailmentReport('org-a', store.db))?.metadata.retrievalId, 'good');
});

test('every read and persistence key is tenant-scoped, including matching hashes and retrieval IDs', async () => {
  const store = database();
  assert.equal(await getCurrentOhlqBailmentReport('org-b', store.db), null);
  await captureOhlqBailmentReport(input('same'), store.db);
  await captureOhlqBailmentReport(input('same', fixture([row({ Date_Paid: '11/18/2026' })]), 0, 'org-b'), store.db);
  assert.equal(store.snapshot().payloads.length, 2);
  assert.notDeepEqual((await getCurrentOhlqBailmentReport('org-a', store.db))?.csvBuffer, (await getCurrentOhlqBailmentReport('org-b', store.db))?.csvBuffer);
  await assert.rejects(getCurrentOhlqBailmentReport('unknown', store.db), /unavailable/);
  await assert.rejects(captureOhlqBailmentReport(input('unknown', fixture(), 0, 'unknown'), store.db), /unavailable/);
});

test('bounded retention protects current, previous distinct payload and current metadata during repeated failures', async () => {
  const store = database();
  await captureOhlqBailmentReport(input('a'), store.db);
  await captureOhlqBailmentReport(input('b', fixture([row()]), 1), store.db);
  await captureOhlqBailmentReport(input('c', fixture([row({ Total: '-0.01' })]), 2), store.db);
  assert.equal(store.snapshot().payloads.length, 2);
  for (let i = 0; i < BAILMENT_RUN_RETENTION + 2; i++) {
    const request = input(`failure-${String(i).padStart(4, '0')}`, fixture(), 3);
    const { csvBuffer: _csv, exportCompleted: _completed, expectedSizeBytes: _size, ...metadata } = request;
    await recordOhlqBailmentFailure({ ...metadata, reason: 'download' }, store.db);
  }
  assert.equal(store.snapshot().runs.length, BAILMENT_RUN_RETENTION + 1, 'current successful retrieval is protected beyond history bound');
  assert.equal(store.snapshot().payloads.length, 2);
  assert.equal((await getCurrentOhlqBailmentReport('org-a', store.db))?.metadata.retrievalId, 'c');
  const replay = await captureOhlqBailmentReport(input('a'), store.db);
  assert.equal(replay.published, false, 'a pruned stale retrieval can never advance current');
  assert.equal((await getCurrentOhlqBailmentReport('org-a', store.db))?.metadata.retrievalId, 'c');
});
