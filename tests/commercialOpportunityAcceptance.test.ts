import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { acceptWholesaleAssessment } from '../lib/acceptWholesaleAssessment';
import { assessWholesaleAccount } from '../lib/wholesaleAssessment';
import { commercialAccountKey } from '../lib/commercialOpportunity';
import { input, purchase } from './fixtures/wholesaleAssessment';

function fixture() {
  const assessment = assessWholesaleAccount(input({ purchases: [purchase(720)] }));
  const row: any = { id: 'assessment', organizationId: 'tenant', wholesaleAccountId: 'account', assessment, state: 'READY', assessmentStatus: 'READY', runId: 'run', title: assessment.title, action: assessment.action, rating: assessment.rating, priorityBand: assessment.band };
  let created = 0; const events: any[] = []; let task: any, existing: any = null;
  const db: any = {
    wholesaleAccountAssessment: { findFirst: async ({ where }: any) => where.organizationId === row.organizationId ? row : null },
    wholesaleAccount: { findFirst: async () => ({ isActive: true, tags: [] }) },
    organizationAccountOverlay: { findFirst: async () => null },
    user: { findFirst: async ({ where }: any) => where.id === 'rep' && where.organizationId === 'tenant' ? { id: 'rep', name: 'Rep', email: 'rep@example.test' } : null },
    salesOpportunity: { findFirst: async () => existing, updateMany: async ({ where }: any) => { assert.equal(where.organizationId, 'tenant'); assert.equal(where.actionedAt, null); }, create: async ({ data }: any) => { created++; existing = { ...data, id: 'pursuit' }; return existing; } },
    worklistItem: { create: async ({ data }: any) => { task = { ...data, id: 'task' }; return task; } },
    opportunityEvent: { createMany: async ({ data }: any) => events.push(...data) },
  };
  db.$transaction = async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(db); };
  const accept = (overrides: any = {}) => acceptWholesaleAssessment({ db: db as PrismaClient, organizationId: 'tenant', id: row.id, candidateKey: commercialAccountKey('account'), actor: { id: 'rep', role: 'USER' }, ...overrides });
  return { db, row, events, accept, created: () => created, task: () => task, pursuit: () => existing, setExisting: (pursuit: any) => { existing = pursuit; } };
}

test('explicit account acceptance freezes commercial evidence with no automatic product pitch and repeat acceptance cannot duplicate', async () => {
  const f = fixture(); assert.ok(f.row.rating >= 3); assert.equal((await f.accept()).taskId, 'task');
  assert.equal(f.created(), 1); assert.equal(f.task().organizationId, 'tenant'); assert.equal(f.task().wholesaleAccountId, 'account');
  assert.equal(f.pursuit().type, 'COMMERCIAL_FOLLOW_UP'); assert.equal(f.pursuit().targetCategory, null); assert.equal(f.pursuit().targetProductId, undefined);
  assert.deepEqual(f.pursuit().signalSnapshot.candidates, []); assert.equal(f.events[0].metadata.commercialRating, f.row.rating);
  assert.equal(f.events.filter(e => e.eventType === 'DETECTED').length, 1);
  await assert.rejects(f.accept(), /existing pursuit/); assert.equal(f.created(), 1);
});

test('tenant boundary, changed account identity, snooze, dismissal, suppression, assignee, pending, error, zero and unrated prevent automatic follow-up', async () => {
  for (const mode of ['tenant', 'changed', 'snooze', 'dismiss', 'suppressed', 'assignee', 'pending', 'error', 'zero', 'unrated']) {
    const f = fixture(); const args: any = {};
    if (mode === 'tenant') args.organizationId = 'other';
    if (mode === 'changed') args.candidateKey = commercialAccountKey('other');
    if (mode === 'pending') f.row.refreshRequestedAt = new Date();
    if (mode === 'error') f.row.assessmentStatus = 'SOURCE_ERROR';
    if (mode === 'snooze') f.row.snoozedUntil = new Date(Date.now() + 86_400_000);
    if (mode === 'dismiss') f.row.dismissedKey = 'historical-dismissal-key';
    if (mode === 'suppressed') f.db.organizationAccountOverlay.findFirst = async () => ({ opportunitySuppressed: true });
    if (mode === 'assignee') args.actor = { id: 'external-user', role: 'USER' };
    if (mode === 'zero') f.row.assessment.rating = 0;
    if (mode === 'unrated') f.row.assessment.rating = null;
    await assert.rejects(f.accept(args)); assert.equal(f.created(), 0, mode);
  }
});

test('accepted historical pursuit, target, notes and task context remain unchanged', async () => {
  const f = fixture();
  const historical = { id: 'old', targetCategory: 'RUM', targetProductId: 'product', notes: 'User selected trial', worklistItems: [{ id: 'manual-task' }], signalSnapshot: { legacyEvidence: true } };
  f.setExisting(historical); const before = structuredClone(historical);
  await assert.rejects(f.accept(), /existing pursuit/); assert.deepEqual(f.pursuit(), before); assert.equal(f.created(), 0);
});
