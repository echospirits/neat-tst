import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { prepareBailmentReportingSeed } from '../scripts/bailment-reporting-prepare';
import { BAILMENT_REPORTING_HEADERS } from '../lib/ohlqBailmentReportingParser';

const project = 'dawn-frog-33352119', branch = 'br-bailment-rehearsal';
const org = 'org_echo_spirits';
const cell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const row = () => ['private vendor', 'Broker', '11/18/2026', 'private invoice', '11/17/2026',
  'PO00001', '', '00100', '', '000123456', '3150B', 'Queen\'s "Share", Rüm\\One',
  'Rum', 'GPT', '-0.25', '0', 'C6', '$1,200.00', '( $1.25 )', '-$300.00', ''];
function fixture(rows = [row(), row(), BAILMENT_REPORTING_HEADERS.map(() => '')]) {
  const bytes = Buffer.from(`\ufeff${[Array.from(BAILMENT_REPORTING_HEADERS), ...rows].map(values => values.map(cell).join(',')).join('\r\n')}\r\n\r\n`);
  const contentHash = createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');
  return {
    projectId: project, branchId: branch,
    organization: { id: org, active: true, accountStatus: 'ACTIVE', enabledStates: ['OH'], timezone: 'America/New_York', settings: { productionForecasting: { ohio: { historyStart: '2019-01-01', directInvoices: 'invoice-date' } } } },
    payload: { id: 'payload-one', organizationId: org, contentHash, csvBase64: bytes.toString('base64'), rowCount: rows.length, byteCount: bytes.length, schemaVersion: 'ohlq-bailment-po-invoice-v1' },
    retrieval: { organizationId: org, retrievalId: 'retrieval-one', requestedAt: '2026-11-18T15:29:41.517Z', acquiredAt: '2026-11-18T15:30:35.342Z', completedAt: '2026-11-18T15:30:35.534Z', requestedFrom: '2019-01-01', requestedTo: '2026-11-18', timezone: 'America/New_York', reportIdentity: 'bdf38254-b332-4d12-b689-1113a2644a40', parameterScope: { parameter: 'Vendor', values: 'all' }, status: 'SUCCEEDED', contentHash, rowCount: rows.length },
  };
}

test('compact transport preserves publication identity and independent reconciliation without transmitting source cells', () => {
  const input = fixture();
  const legacy = prepareBailmentReportingSeed(input, project, branch, true);
  const compact = prepareBailmentReportingSeed(input, project, branch, true, true);
  assert.equal(compact.snapshotId, legacy.snapshotId);
  assert.equal(compact.requestId, legacy.requestId);
  assert.equal(compact.requestFingerprint, legacy.requestFingerprint);
  assert.deepEqual(compact.expectedDigests, legacy.expectedDigests);
  assert.equal(compact.verificationSql, legacy.verificationSql);
  assert.equal(compact.rowCount, 3);
  assert.equal(compact.exactTypedCells, 63);
  assert.equal(compact.transactionRequired, true);
  assert.equal(compact.serverSource, true);
  assert.doesNotMatch(compact.statements.join('\n'), /private vendor|private invoice|Rüm/);
  assert.match(compact.serverSourcePreflightSql!, /"targetMatches"/);
  assert.match(compact.serverSourcePreflightSql!, /"rawCellsMatch"/);
  assert.doesNotMatch(compact.serverSourcePreflightSql!, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
});

test('only compact transport refuses multiline cells, with no source data in the error', () => {
  const multiline = row(); multiline[11] = 'private\nmultiline';
  const input = fixture([multiline]);
  assert.equal(prepareBailmentReportingSeed(input, project, branch, true).rowCount, 1);
  assert.throws(() => prepareBailmentReportingSeed(input, project, branch, true, true), { message: 'server-source-multiline-unsupported' });
});

test('compact transfer stays bounded for full-history exports and retains exact row/duplicate totals', () => {
  const input = fixture(Array.from({ length: 6202 }, row));
  const compact = prepareBailmentReportingSeed(input, project, branch, true, true);
  assert.equal(compact.rowCount, 6202);
  assert.equal(compact.statements.length, 9);
  assert.ok(Buffer.byteLength(compact.statements.join('\n')) < 25000);
  assert.ok(Buffer.byteLength(compact.serverSourcePreflightSql!) < 5000);
  assert.equal(compact.statements.filter(statement => statement.includes('INSERT INTO "OhlqBailmentReportingLine"')).length, 1);
});

test('compact transport still rejects a different target or altered retained bytes before producing SQL', () => {
  const input = fixture();
  assert.throws(() => prepareBailmentReportingSeed(input, project, 'br-wrong', true, true), { message: 'target-identity-mismatch' });
  input.payload.csvBase64 = Buffer.from('changed').toString('base64');
  assert.throws(() => prepareBailmentReportingSeed(input, project, branch, true, true), { message: 'source-byte-count-mismatch' });
});
