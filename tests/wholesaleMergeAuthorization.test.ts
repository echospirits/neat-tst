import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Prisma, UserRole } from '@prisma/client';
import { loadMergeAuth, loadMergeModule, loadMergeService, redirectForTest } from './helpers/wholesaleMergeHarness';

type Row = Record<string, any>;
const tenantModels = ['loggedVisit', 'worklistItem', 'locationContact', 'locationTag', 'menuPlacement', 'recipeSuggestion', 'targetAccountProfile'];
const targetModels = ['targetAccountProfile', 'targetAccountScoreHistory', 'targetAccountMetric', 'targetPublicResearch', 'targetSkuOpportunity', 'targetHeatLossAlert', 'targetChainMembership'];
function fixture({ role = UserRole.PLATFORM_ADMIN, isActive = true, targetConflict = false }: {
  role?: UserRole; isActive?: boolean; targetConflict?: boolean;
} = {}) {
  const calls: { model: string; operation: string; args: Row }[] = [];
  const rows: Record<string, Row[]> = {};
  const db: Row = {};
  const account = (id: string) => ({
    id, name: id, isActive: true, mergedIntoId: null, officialAccountId: null,
    licenseeId: id === 'source' ? 'manual-source' : '1234567',
    licenseeIds: [{ licenseeId: id === 'source' ? 'manual-source' : '1234567' }],
    address: null, agencyId: null, city: null, county: null, deliveryDay: null, districtId: null,
    ownership: null, phone: null, state: 'OH', zip: null, ohlqLastEchoPurchaseDate: null,
  });
  const accounts: Record<string, Row> = { source: account('source'), target: account('target') };
  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) =>
    key === 'OR' ? (value as Row[]).some(condition => matches(row, condition)) : row[key] === value,
  );
  for (const model of [...new Set([...tenantModels, ...targetModels, 'targetOwnershipGroup'])]) {
    const key = model === 'targetOwnershipGroup' ? 'bestEntryWholesaleAccountId' : 'wholesaleAccountId';
    rows[model] = tenantModels.includes(model)
      ? ['org-a', 'org-b'].map((organizationId, index) => ({
          id: `${model}-${index}`, organizationId, [key]: 'source', tagId: 'shared-tag', recipeId: 'shared-recipe',
        }))
      : [{ id: model, [key]: 'source' }];
    if (model === 'locationTag' || model === 'recipeSuggestion') {
      rows[model].push({ ...rows[model][0], id: `${model}-destination`, [key]: 'target' });
    }
    if (targetConflict && model === 'targetPublicResearch') rows[model].push({ id: 'conflict', [key]: 'target' });
    db[model] = {
      count: async ({ where }: Row) => rows[model].filter(row => matches(row, where)).length,
      findMany: async ({ where, select }: Row) => rows[model].filter(row => matches(row, where))
        .map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]]))),
      deleteMany: async (args: Row) => {
        calls.push({ model, operation: 'deleteMany', args });
        const count = rows[model].filter(row => matches(row, args.where)).length;
        rows[model] = rows[model].filter(row => !matches(row, args.where));
        return { count };
      },
      updateMany: async (args: Row) => {
        calls.push({ model, operation: 'updateMany', args });
        let count = 0;
        for (const row of rows[model]) if (matches(row, args.where)) { Object.assign(row, args.data); count++; }
        return { count };
      },
    };
  }
  db.user = { findUnique: async (args: Row) => {
    calls.push({ model: 'user', operation: 'findUnique', args });
    return { role, isActive };
  } };
  db.wholesaleAccount = {
    findUnique: async ({ where }: Row) => accounts[where.id] ?? null,
    update: async (args: Row) => {
      calls.push({ model: 'wholesaleAccount', operation: 'update', args });
      Object.assign(accounts[args.where.id], args.data);
      return accounts[args.where.id];
    },
  };
  db.wholesaleLicenseeId = {
    deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }), upsert: async () => ({}),
  };
  db.$transaction = async (callback: (tx: Row) => Promise<unknown>, options: Row) => {
    calls.push({ model: 'transaction', operation: 'begin', args: options });
    return callback(db);
  };
  return { db, rows, calls, accounts };
}

describe('wholesale merge authorization', () => {
  for (const role of [UserRole.ADMIN, UserRole.USER, UserRole.TASTER, null]) {
    it(`denies ${role ?? 'anonymous'} before candidate reads, preview reads, or a transaction`, async () => {
      const forbiddenDb = new Proxy({}, { get: () => { throw new Error('unauthorized database access'); } });
      const service = loadMergeService(forbiddenDb, role);
      await assert.rejects(service.getWholesaleMergeCandidates({
        query: '', source: { id: 'source' } as any,
      }), /redirect:/);
      await assert.rejects(service.getWholesaleAccountMergePreview('source', 'target'), /redirect:/);
      await assert.rejects(service.mergeWholesaleAccounts({ sourceId: 'source', targetId: 'target' }), /redirect:/);
    });
  }

  it('denies inactive platform sessions before database reads', async () => {
    const service = loadMergeService(new Proxy({}, { get: () => { throw new Error('unauthorized database access'); } }), UserRole.PLATFORM_ADMIN, false);
    await assert.rejects(service.mergeWholesaleAccounts({ sourceId: 'source', targetId: 'target' }), /redirect:\/login/);
  });

  for (const actor of [{ role: UserRole.ADMIN, isActive: true }, { role: UserRole.PLATFORM_ADMIN, isActive: false }]) {
    it(`rechecks the actor inside the transaction (${actor.role}, active=${actor.isActive})`, async () => {
      const f = fixture(actor);
      const service = loadMergeService(f.db);
      await assert.rejects(service.mergeWholesaleAccounts({ sourceId: 'source', targetId: 'target' }), (error: any) => error.code === 'forbidden');
      assert.deepEqual(f.calls.map(call => call.model), ['transaction', 'user']);
      assert.equal(f.accounts.source.mergedIntoId, null);
      assert.equal(f.rows.loggedVisit[0].wholesaleAccountId, 'source');
    });
  }

  it('denies tenant admins at the action and page boundaries, including forged confirmation', async () => {
    const auth = loadMergeAuth(UserRole.ADMIN);
    const deps = {
      '../../../../lib/auth': auth,
      '../../../../lib/prisma': { prisma: new Proxy({}, { get: () => { throw new Error('unauthorized page read'); } }) },
      '../../../../lib/appBrand': { buildPageMetadata: () => ({}) },
      '../../../../lib/wholesaleAccountMerge': { mergeWholesaleAccounts: async () => { throw new Error('unauthorized mutation'); } },
      'next/navigation': { redirect: redirectForTest },
      'next/cache': { revalidatePath: () => { throw new Error('unauthorized revalidation'); } },
      '../../../components/SubmitButton': { SubmitButton: () => null },
      '../../../components/PageChrome': { PageHeader: () => null },
      './actions': {},
    };
    const action = loadMergeModule<typeof import('../app/wholesale/[id]/merge/actions')>('app/wholesale/[id]/merge/actions.ts', deps);
    const page = loadMergeModule<typeof import('../app/wholesale/[id]/merge/page')>('app/wholesale/[id]/merge/page.tsx', deps);
    const form = new FormData();
    form.set('sourceId', 'source'); form.set('targetId', 'target'); form.set('confirmation', 'MERGE');
    await assert.rejects(action.mergeWholesaleAccountAction(form), /redirect:\/$/);
    await assert.rejects(page.default({ params: Promise.resolve({ id: 'source' }) }), /redirect:\/$/);
  });

  it('allows a platform preview and blocks conflicting target intelligence before writes', async () => {
    const f = fixture({ targetConflict: true });
    const service = loadMergeService(f.db);
    const preview = await service.getWholesaleAccountMergePreview('source', 'target');
    assert.equal(preview.counts.visits, 2);
    assert.equal(preview.blockers.length, 1);
    await assert.rejects(service.mergeWholesaleAccounts({ sourceId: 'source', targetId: 'target' }), (error: any) => error.code === 'target-has-target-data-conflict');
    assert.equal(f.calls.some(call => /update|delete/.test(call.operation)), false);
  });

  it('moves both organizations without changing ownership, removes only same-tenant duplicates, and audits the authenticated actor', async () => {
    const f = fixture();
    const service = loadMergeService(f.db);
    await service.mergeWholesaleAccounts({ sourceId: 'source', targetId: 'target', mergedByUserId: 'forged-user' } as any);
    assert.equal(f.calls[0].args.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    for (const model of tenantModels) {
      assert.ok(f.rows[model].some(row => row.organizationId === 'org-b' && row.wholesaleAccountId === 'target'), model);
      assert.ok(f.rows[model].some(row => row.organizationId === 'org-a' && row.wholesaleAccountId === 'target'), model);
    }
    for (const model of ['locationTag', 'recipeSuggestion']) {
      assert.equal(f.rows[model].length, 2);
      assert.equal(f.rows[model].some(row => row.id === `${model}-0`), false);
      assert.equal(f.rows[model].some(row => row.id === `${model}-1`), true);
    }
    for (const call of f.calls.filter(call => call.operation === 'updateMany')) {
      assert.equal(Object.hasOwn(call.args.data, 'organizationId'), false);
    }
    const snapshot = f.accounts.source.mergeSnapshot;
    assert.equal(f.accounts.source.mergedByUserId, 'authenticated-actor');
    assert.equal(f.accounts.source.mergedIntoId, 'target');
    assert.equal(f.accounts.source.isActive, false);
    assert.equal(snapshot.mergeAudit.scope, 'all-organizations');
    assert.equal(snapshot.mergeAudit.actorUserId, 'authenticated-actor');
    assert.equal(snapshot.mergeAudit.sourceId, 'source');
    assert.equal(snapshot.mergeAudit.targetId, 'target');
    assert.equal(snapshot.mergeAudit.movedRecords.loggedVisit, 2);
    assert.equal(snapshot.mergeAudit.movedRecords.targetAccountProfile, 2);
    assert.equal(snapshot.mergeAudit.removedDuplicateRecords.locationTag, 1);
    assert.equal(snapshot.mergeAudit.removedDuplicateRecords.recipeSuggestion, 1);
    assert.deepEqual(Array.from(snapshot.licenseeIds), ['MANUAL-SOURCE']);
    await assert.rejects(service.mergeWholesaleAccounts({ sourceId: 'source', targetId: 'target' }), (error: any) => error.code === 'already-merged');
  });

  it('requires confirmation for platform submissions and preserves success revalidation and redirect', async () => {
    const f = fixture();
    const service = loadMergeService(f.db);
    const paths: string[] = [];
    const action = loadMergeModule<typeof import('../app/wholesale/[id]/merge/actions')>('app/wholesale/[id]/merge/actions.ts', {
      '../../../../lib/auth': loadMergeAuth(UserRole.PLATFORM_ADMIN),
      '../../../../lib/wholesaleAccountMerge': service,
      'next/navigation': { redirect: redirectForTest },
      'next/cache': { revalidatePath: (path: string) => paths.push(path) },
    });
    const form = new FormData();
    form.set('sourceId', 'source'); form.set('targetId', 'target');
    await assert.rejects(action.mergeWholesaleAccountAction(form), /confirmation-required/);
    assert.equal(f.calls.length, 0);
    form.set('confirmation', 'MERGE');
    await assert.rejects(action.mergeWholesaleAccountAction(form), /redirect:\/wholesale\/target\?status=merged/);
    assert.ok(paths.includes('/wholesale/source'));
    assert.ok(paths.includes('/wholesale/target'));
    assert.ok(paths.includes('/alerts'));
  });

  it('shows the shared merge entry only to platform admins and explains the global confirmation', () => {
    const detail = readFileSync('app/wholesale/[id]/page.tsx', 'utf8');
    assert.match(detail, /user.role === UserRole.PLATFORM_ADMIN && !account.officialAccountId/);
    const page = readFileSync('app/wholesale/[id]/merge/page.tsx', 'utf8');
    assert.match(page, /activity from every organization/);
  });
});

