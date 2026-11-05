import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTastingCsv } from '../lib/tastings/csv';

const header = 'Date,Start Time,End Time,Agency ID,Assigned taster,Status';
const row = '2026-11-20,16:00,18:00,00101,taster@example.test,DRAFT';

test('spreadsheet headers map to import identities while quoted notes and historical counts remain intact', () => {
  const records = parseTastingCsv('\uFEFFRow Key,Date,Start Time,End Time,Agency ID,Assigned taster,Current Status,Notes for taster,Internal/Joe notes,Same-day bottle sales\r\n' +
    'stable-1,2026-11-20,16:00,18:00,00101,taster@example.test,State Approved,"Ask Taylor, the buyer","Line one\nLine two",12\r\n\r\n');
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { rowKey: 'stable-1', date: '2026-11-20', startTime: '16:00', endTime: '18:00', agencyId: '00101', assignedTaster: 'taster@example.test', status: 'State Approved', tasterNotes: 'Ask Taylor, the buyer', internalNotes: 'Line one\nLine two', historicalBottles: '12' });
});

test('CSV parser preserves unmatched names and opaque visible statuses for reviewed import validation', () => {
  const [record] = parseTastingCsv('DATE,START TIME,END TIME,AGENCY ID,TASTER,STATUS,Response Comment,Cancellation Reason\n2026-11-20,16:00,18:00,101,Old Taster Name,Taster Needs Edit,"After 5, please",');
  assert.equal(record.assignedTaster, 'Old Taster Name');
  assert.equal(record.status, 'Taster Needs Edit');
  assert.equal(record.responseComment, 'After 5, please');
  assert.equal(record.cancellationReason, '');
});

test('current-sheet shaped rows preserve Coverage identity, source approver and unknown sales text without guessing', () => {
  const [record] = parseTastingCsv('Date,Start Time,End Time,Agency ID,Store,Approved By,Coverage,Status,Retail Bottles Sold at Agency On Date,E-mails Gathered,Notes for Taster,Joe Notes,Event_Key\n2026-11-05,16:00,18:00,101,Synthetic store,Original store approver,Unmatched Taster,State Approved,out of stock,4,Setup notes,Coordinator notes,2026-11-05|taster');
  assert.equal(record.assignedTaster, 'Unmatched Taster');
  assert.equal(record.originalApprover, 'Original store approver');
  assert.equal(record.historicalBottles, '');
  assert.equal(record.historicalSalesNote, 'out of stock');
  assert.equal(record.emailsGathered, '4');
  assert.equal(record.sourceEventKey, '2026-11-05|taster');
  assert.equal(record.rowKey, undefined);
});

test('missing identity columns and malformed CSV fail before preview or writes', () => {
  assert.throws(() => parseTastingCsv('Date,Agency ID,Status\n2026-11-20,101,DRAFT'), /Include Date, Start Time/);
  assert.throws(() => parseTastingCsv(`${header},Notes for taster\n${row},"Unclosed note`), /CSV could not be read/);
  assert.throws(() => parseTastingCsv(`${header}\n${row},extra-column`), /CSV could not be read/);
});

test('duplicate exact or alias headers are rejected rather than guessing which value owns a milestone', () => {
  assert.throws(() => parseTastingCsv(`${header},Status\n${row},State Approved`), /duplicate column names are ambiguous/);
  assert.throws(() => parseTastingCsv(`${header},Taster\n${row},someone-else@example.test`), /duplicate column names are ambiguous/);
});

test('CSV import accepts the row bound and rejects empty, oversized and over-limit exports', () => {
  assert.equal(parseTastingCsv(`${header}\n${Array.from({ length: 500 }, () => row).join('\n')}`).length, 500);
  assert.throws(() => parseTastingCsv(`${header}\n${Array.from({ length: 501 }, () => row).join('\n')}`), /between 1 and 500 rows/);
  assert.throws(() => parseTastingCsv(header), /between 1 and 500 rows/);
  assert.throws(() => parseTastingCsv('  \n\t'), /up to 1 MB/);
  assert.throws(() => parseTastingCsv('x'.repeat(1_000_001)), /up to 1 MB/);
});
