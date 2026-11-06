import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { UserRole } from '@prisma/client';
import ts from 'typescript';
import { deriveTastingStatus, isTastingStatus, isTerminalTasting, TASTING_WORKFLOW_STATUSES } from '../lib/tastings/model';
import { activeTastingWhere, terminalTastingWhere } from '../lib/tastings/statusWhere';

const admin = { organizationId: 'org-a', userId: 'admin-a', role: UserRole.ADMIN };
const taster = { organizationId: 'org-a', userId: 'taster-a', role: UserRole.TASTER };
const history = [
  { id: 'h-admin', type: 'DETAILS_UPDATED', oldValue: { internalNotes: 'PRIVATE BEFORE' }, newValue: { internalNotes: 'PRIVATE AFTER' }, comment: 'PRIVATE COMMENT' },
  { id: 'h-edit', type: 'TASTER_NEEDS_EDIT', oldValue: { agencyApproval: 'APPROVED' }, newValue: { tasterResponse: 'NEEDS_EDIT' }, comment: 'I can work after 5.' },
  { id: 'h-cancel', type: 'CANCELLED', oldValue: {}, newValue: { cancelledBy: 'admin-a' }, comment: 'Store closed.' },
  { id: 'h-status-edit', type: 'WORKFLOW_STATUS_CHANGED', oldValue: { status: 'STATE_APPROVED', internalNotes: 'PRIVATE HISTORY' }, newValue: { status: 'TASTER_NEEDS_EDIT', approvedAssignment: 'PRIVATE ASSIGNMENT' }, comment: 'I need a different time.' },
  { id: 'h-status-denial', type: 'WORKFLOW_STATUS_CHANGED', oldValue: { status: 'IMPORT_REVIEW' }, newValue: { status: 'STATE_DENIED' }, comment: 'PRIVATE DENIAL COMMENT' },
  { id: 'h-status-invalid', type: 'WORKFLOW_STATUS_CHANGED', oldValue: { status: '<script>PRIVATE</script>' }, newValue: { status: '__proto__' }, comment: 'PRIVATE INVALID COMMENT' },
];
const row = (id: string, organizationId: string, assignedTasterUserId: string) => ({
  id, organizationId, assignedTasterUserId, agencyId: 'agency-a',
  internalNotes: `PRIVATE ${organizationId}`, importMetadata: { originalTaster: 'PRIVATE IMPORT NAME' },
  tasterNotes: 'Check in with Taylor.', history,
  scheduledDate: new Date('2026-11-20T00:00:00Z'), startsAt: new Date('2026-11-20T20:00:00Z'), endsAt: new Date('2026-11-20T22:00:00Z'),
  tasterResponse: 'PENDING', agencyApproval: 'NOT_REQUESTED', stateApproval: 'NOT_SUBMITTED', cancelledAt: null, completedAt: null, workflowStatusOverride: null,
  agency: { id: 'agency-a', name: 'Agency A' }, assignedTaster: { id: assignedTasterUserId, name: 'Taster' },
});

function matchesWhere(record: any, where: any): boolean {
  return Object.entries(where).every(([key, expected]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(expected) ? expected : [expected]).every(clause => matchesWhere(record, clause));
    if (key === 'OR') return expected.some((clause: any) => matchesWhere(record, clause));
    const value = record[key];
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) return value === expected;
    if ('in' in expected) return expected.in.includes(value);
    if ('notIn' in expected) return value != null && !expected.notIn.includes(value);
    if ('not' in expected) return value !== expected.not;
    if ('gte' in expected && !(value >= expected.gte)) return false;
    if ('lt' in expected && !(value < expected.lt)) return false;
    if ('contains' in expected) return String(value ?? '').toLowerCase().includes(String(expected.contains).toLowerCase());
    if ('gte' in expected || 'lt' in expected) return true;
    return value != null && matchesWhere(value, expected);
  });
}

function fixture(entitled = true, rows: any[] = [row('mine', 'org-a', 'taster-a'), row('team', 'org-a', 'taster-b'), row('foreign', 'org-b', 'taster-a')]) {
  const calls: Array<{ table: string; query: any }> = [];
  const scopedRows = (query: any) => rows.filter(record => matchesWhere(record, query.where));
  const dependencies = {
    activeTastingWhere, terminalTastingWhere, isTastingStatus,
    prisma: {
      organizationFeature: { findFirst: async (query: any) => {
        calls.push({ table: 'feature', query });
        assert.equal(query.where.organizationId, 'org-a');
        assert.equal(query.where.featureKey, 'TASTING_MANAGEMENT');
        assert.equal(query.where.enabled, true);
        return entitled ? { id: 'pilot-a' } : null;
      } },
      tastingEvent: {
        findMany: async (query: any) => { calls.push({ table: 'list', query }); return scopedRows(query); },
        findFirst: async (query: any) => { calls.push({ table: 'detail', query }); return scopedRows(query).find(record => record.id === query.where.id) ?? null; },
      },
      user: { findMany: async (query: any) => { calls.push({ table: 'users', query }); return [{ id: 'taster-a' }]; } },
    },
    isAdminRole: (role: UserRole) => role === UserRole.ADMIN || role === UserRole.PLATFORM_ADMIN,
  };
  const filename = resolve('lib/tastings/queries.ts');
  const nativeRequire = createRequire(filename);
  const exports: Record<string, (...args: any[]) => Promise<any>> = {};
  runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require: (name: string) => name === '@prisma/client' ? nativeRequire(name) : dependencies,
  });
  return { listTastings: exports.listTastings, getTasting: exports.getTasting, tastingEditorOptions: exports.tastingEditorOptions, calls };
}

test('tasting list tenant scope cannot be widened by an assignee filter, and taster payloads omit admin evidence', async () => {
  const f = fixture();
  const rows = await f.listTastings(taster, { assignedTasterUserId: 'taster-b', agencyId: 'agency-a', limit: 9999, offset: 999999 });
  assert.deepEqual(Array.from(rows, (record: any) => record.id), ['mine']);
  assert.equal(rows[0].internalNotes, null);
  assert.equal(rows[0].importMetadata, null);
  assert.equal(rows[0].tasterNotes, 'Check in with Taylor.');
  const { query } = f.calls.find(call => call.table === 'list')!;
  assert.equal(query.where.organizationId, 'org-a');
  assert.equal(query.where.assignedTasterUserId, taster.userId);
  assert.equal(query.where.agencyId, 'agency-a');
  assert.equal(query.take, 250);
  assert.equal(query.skip, 50000);
});

test('admin list remains tenant scoped and retains the admin notes needed for coordination', async () => {
  const f = fixture();
  const rows = await f.listTastings(admin);
  assert.deepEqual(Array.from(rows, (record: any) => record.id), ['mine', 'team']);
  assert.equal(rows[0].internalNotes, 'PRIVATE org-a');
  assert.equal(rows[0].importMetadata.originalTaster, 'PRIVATE IMPORT NAME');
  assert.equal(f.calls.find(call => call.table === 'list')!.query.where.assignedTasterUserId, undefined);
});

test('detail reads reject both another tenant and another assigned taster', async () => {
  const f = fixture();
  assert.equal(await f.getTasting(taster, 'foreign'), null);
  assert.equal(await f.getTasting(taster, 'team'), null);
  assert.equal(await f.getTasting(admin, 'foreign'), null);
  const mine = await f.getTasting(taster, 'mine');
  assert.equal(mine.id, 'mine');
  assert.equal(mine.internalNotes, null);
  assert.equal(mine.importMetadata, null);
  assert.equal(mine.history[0].comment, null);
  assert.equal(mine.history[0].oldValue, null);
  assert.equal(mine.history[0].newValue, null);
  assert.equal(mine.history[1].comment, 'I can work after 5.');
  assert.equal(mine.history[2].comment, 'Store closed.');
  assert.equal(mine.history[3].statusChange.previous, 'STATE_APPROVED');
  assert.equal(mine.history[3].statusChange.current, 'TASTER_NEEDS_EDIT');
  assert.equal(mine.history[3].comment, 'I need a different time.');
  assert.equal(mine.history[3].oldValue, null);
  assert.equal(mine.history[3].newValue, null);
  assert.equal(mine.history[4].statusChange.previous, 'IMPORT_REVIEW');
  assert.equal(mine.history[4].statusChange.current, 'STATE_DENIED');
  assert.equal(mine.history[4].comment, null);
  assert.equal(mine.history[5].statusChange, null);
  assert.equal(mine.history[5].comment, null);
  assert.ok(!JSON.stringify(mine).includes('PRIVATE'));
  const detailCalls = f.calls.filter(call => call.table === 'detail');
  assert.ok(detailCalls.every(call => call.query.where.organizationId === 'org-a'));
  assert.equal(detailCalls[0].query.include.history.take, 100);
});

test('coordinators retain complete milestone history while a dark pilot reads no tasting table', async () => {
  const active = fixture();
  const record = await active.getTasting(admin, 'mine');
  assert.equal(record.history[0].oldValue.internalNotes, 'PRIVATE BEFORE');
  assert.equal(record.history[0].comment, 'PRIVATE COMMENT');
  const dark = fixture(false);
  assert.equal((await dark.listTastings(admin)).length, 0);
  assert.equal(await dark.getTasting(taster, 'mine'), null);
  assert.deepEqual(dark.calls.map(call => call.table), ['feature', 'feature']);
});

test('history scope includes unresolved past events and effective terminal states without losing search or ordering', async () => {
  const f = fixture();
  const today = new Date('2026-11-05T00:00:00.000Z');
  await f.listTastings(admin, { view: 'history', today, search: 'x'.repeat(200), limit: 25 });
  const { query } = f.calls.find(call => call.table === 'list')!;
  const alternatives = query.where.AND[0].OR;
  assert.equal(alternatives[0], terminalTastingWhere);
  assert.equal(alternatives.find((value: any) => value.scheduledDate)?.scheduledDate.lt, today);
  assert.equal(query.orderBy[0].scheduledDate, 'desc');
  assert.equal(query.where.OR[0].agency.name.contains.length, 120);
});

test('upcoming and history follow reopened workflow states while real completion remains historical', async () => {
  const completedAt = new Date('2026-11-05T20:00:00Z');
  const rows = [
    { ...row('reopened-cancelled', 'org-a', 'taster-a'), cancelledAt: completedAt, workflowStatusOverride: 'DRAFT' },
    { ...row('reopened-denied', 'org-a', 'taster-a'), agencyApproval: 'DENIED', stateApproval: 'DENIED', workflowStatusOverride: 'STATE_APPROVED' },
    { ...row('manually-completed', 'org-a', 'taster-a'), workflowStatusOverride: 'COMPLETED' },
    { ...row('evidence-completed', 'org-a', 'taster-a'), completedAt, workflowStatusOverride: 'DRAFT' },
    { ...row('legacy-cancelled', 'org-a', 'taster-a'), cancelledAt: completedAt },
    { ...row('legacy-denied', 'org-a', 'taster-a'), agencyApproval: 'DENIED' },
    { ...row('past-unresolved', 'org-a', 'taster-a'), scheduledDate: new Date('2026-11-01T00:00:00Z') },
    { ...row('foreign-reopened', 'org-b', 'taster-a'), workflowStatusOverride: 'DRAFT' },
    { ...row('other-assignee-reopened', 'org-a', 'taster-b'), workflowStatusOverride: 'DRAFT' },
  ];
  const f = fixture(true, rows);
  const today = new Date('2026-11-06T00:00:00Z');
  assert.deepEqual(Array.from(await f.listTastings(taster, { view: 'upcoming', today }), (record: any) => record.id), ['reopened-cancelled', 'reopened-denied']);
  assert.deepEqual(Array.from(await f.listTastings(taster, { view: 'history', today }), (record: any) => record.id), ['manually-completed', 'evidence-completed', 'legacy-cancelled', 'legacy-denied', 'past-unresolved']);
});

test('database active and terminal predicates agree with effective status and preserve real Visit evidence for every status', () => {
  const baseline = row('status', 'org-a', 'taster-a');
  for (const workflowStatusOverride of [null, 'INVALID', ...TASTING_WORKFLOW_STATUSES]) {
    for (const historical of [{}, { cancelledAt: new Date() }, { agencyApproval: 'DENIED' }, { stateApproval: 'DENIED' }, { completedAt: new Date() }]) {
      const record = { ...baseline, ...historical, workflowStatusOverride };
      const terminal = isTerminalTasting(record);
      const label = `${workflowStatusOverride}: ${JSON.stringify(historical)}`;
      assert.equal(matchesWhere(record, activeTastingWhere), !terminal, label);
      assert.equal(matchesWhere(record, terminalTastingWhere), terminal, label);
      if (workflowStatusOverride && workflowStatusOverride !== 'INVALID') assert.equal(deriveTastingStatus(record), workflowStatusOverride);
    }
  }
});

test('tasting editor assignments are admin-only and limited to active tenant users', async () => {
  const f = fixture();
  await assert.rejects(f.tastingEditorOptions(taster), /Administrator access/);
  assert.equal(f.calls.length, 0);
  await f.tastingEditorOptions(admin);
  const { query } = f.calls[0];
  assert.equal(query.where.organizationId, 'org-a');
  assert.equal(query.where.isActive, true);
});
