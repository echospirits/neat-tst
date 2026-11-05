import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { UserRole } from '@prisma/client';
import ts from 'typescript';

const admin = { organizationId: 'org-a', userId: 'admin-a', role: UserRole.ADMIN };
const taster = { organizationId: 'org-a', userId: 'taster-a', role: UserRole.TASTER };
const history = [
  { id: 'h-admin', type: 'DETAILS_UPDATED', oldValue: { internalNotes: 'PRIVATE BEFORE' }, newValue: { internalNotes: 'PRIVATE AFTER' }, comment: 'PRIVATE COMMENT' },
  { id: 'h-edit', type: 'TASTER_NEEDS_EDIT', oldValue: { agencyApproval: 'APPROVED' }, newValue: { tasterResponse: 'NEEDS_EDIT' }, comment: 'I can work after 5.' },
  { id: 'h-cancel', type: 'CANCELLED', oldValue: {}, newValue: { cancelledBy: 'admin-a' }, comment: 'Store closed.' },
];
const row = (id: string, organizationId: string, assignedTasterUserId: string) => ({
  id, organizationId, assignedTasterUserId, agencyId: 'agency-a',
  internalNotes: `PRIVATE ${organizationId}`, importMetadata: { originalTaster: 'PRIVATE IMPORT NAME' },
  tasterNotes: 'Check in with Taylor.', history,
  agency: { id: 'agency-a', name: 'Agency A' }, assignedTaster: { id: assignedTasterUserId, name: 'Taster' },
});

function fixture(entitled = true) {
  const calls: Array<{ table: string; query: any }> = [];
  const rows = [row('mine', 'org-a', 'taster-a'), row('team', 'org-a', 'taster-b'), row('foreign', 'org-b', 'taster-a')];
  const scopedRows = (query: any) => rows.filter(record => record.organizationId === query.where.organizationId && (!query.where.assignedTasterUserId || record.assignedTasterUserId === query.where.assignedTasterUserId));
  const dependencies = {
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

test('history scope includes unresolved past events, denied/cancelled events and evidence-based completion', async () => {
  const f = fixture();
  const today = new Date('2026-11-05T00:00:00.000Z');
  await f.listTastings(admin, { view: 'history', today, search: 'x'.repeat(200), limit: 25 });
  const { query } = f.calls.find(call => call.table === 'list')!;
  const alternatives = query.where.AND[0].OR;
  assert.ok(alternatives.some((value: any) => value.completedAt?.not === null));
  assert.ok(alternatives.some((value: any) => value.cancelledAt?.not === null));
  assert.ok(alternatives.some((value: any) => value.agencyApproval === 'DENIED'));
  assert.ok(alternatives.some((value: any) => value.stateApproval === 'DENIED'));
  assert.equal(alternatives.find((value: any) => value.scheduledDate)?.scheduledDate.lt, today);
  assert.equal(query.orderBy[0].scheduledDate, 'desc');
  assert.equal(query.where.OR[0].agency.name.contains.length, 120);
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
