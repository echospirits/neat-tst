import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { addDaysToDateInputValue } from '../lib/dateTime';
import { getSchedulerWeekDates, isValidSchedulerDate } from '../lib/myDayWeekScheduler';
import { tastingExecutionStatus } from '../lib/tastings/model';

function loadModule(path: string, dependencies: Record<string, unknown>) {
  const values: Record<string, unknown> = { EASTERN_TIME_ZONE: 'America/New_York', ...dependencies };
  const filename = resolve(path);
  const nativeRequire = createRequire(filename);
  const exports: Record<string, (...args: any[]) => any> = {};
  runInNewContext(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (name: string) => ['@prisma/client', 'react', 'react/jsx-runtime'].includes(name)
      ? nativeRequire(name)
      : new Proxy(values, { get: (dependencies, key: string) => dependencies[key] ?? (() => null) }),
  });
  return exports;
}

test('taster My Week reads only their tasting assignments and avoids the broad dashboard', async () => {
  const calls: string[] = [];
  const page = loadModule('app/page.tsx', {
    requireUser: async (options: { allowTaster: boolean }) => {
      assert.equal(options.allowTaster, true);
      return { id: 'taster-a', role: 'TASTER' };
    },
    requireOrganizationContext: async () => ({ organizationId: 'org-a' }),
    getOrganizationFeatures: async () => new Set(['TASTING_MANAGEMENT']),
    getSchedulerWeekDates,
    isValidSchedulerDate,
    addDaysToDateInputValue,
    formatEasternDateInputValue: () => '2026-11-05',
    tastingExecutionStatus,
    listTastings: async (actor: { organizationId: string; userId: string; role: string }, options: { from: Date; to: Date; assignedTasterUserId: string }) => {
      calls.push('tastings');
      assert.equal(actor.organizationId, 'org-a');
      assert.equal(actor.userId, 'taster-a');
      assert.equal(actor.role, 'TASTER');
      assert.equal(options.assignedTasterUserId, actor.userId);
      assert.equal(options.from.toISOString(), '2026-11-02T00:00:00.000Z');
      assert.equal(options.to.toISOString(), '2026-11-09T00:00:00.000Z');
      return [];
    },
    prisma: new Proxy({}, { get: () => { throw new Error('The restricted taster schedule must not load broad dashboard data.'); } }),
  });
  assert.ok(await page.default({ searchParams: Promise.resolve({ date: '2026-11-05', view: 'week' }) }));
  assert.deepEqual(calls, ['tastings']);
});

test('a dark pilot keeps the former taster home behavior and reads no tasting data', async () => {
  const page = loadModule('app/page.tsx', {
    requireUser: async () => ({ id: 'taster-a', role: 'TASTER' }),
    requireOrganizationContext: async () => ({ organizationId: 'org-a' }),
    getOrganizationFeatures: async () => new Set(),
    getSchedulerWeekDates, isValidSchedulerDate, addDaysToDateInputValue,
    formatEasternDateInputValue: () => '2026-11-05',
    listTastings: () => { throw new Error('Disabled tasting reads are forbidden.'); },
    redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  });
  await assert.rejects(page.default({}), /redirect:\/visits\/new/);
});

test('Agency timeline tasting evidence is tenant scoped and excludes internal history payloads', async () => {
  const workflowCalls: unknown[] = [];
  const empty = { findMany: async () => [] };
  const module = loadModule('lib/crm/accountTimeline.ts', {
    prisma: {
      worklistItem: empty, eventShift: empty, organizationAuditEvent: empty,
      tastingWorkflowEvent: { findMany: async (query: any) => {
        workflowCalls.push(query);
        assert.equal(query.where.organizationId, 'org-a');
        assert.equal(query.where.tasting.organizationId, 'org-a');
        assert.equal(query.where.tasting.agencyId, 'agency-a');
        assert.equal(query.take, 50);
        assert.equal(query.select.comment, undefined);
        assert.equal(query.select.oldValue, undefined);
        assert.equal(query.select.newValue, undefined);
        return [{ id: 'history-a', type: 'STATE_APPROVED', actorUserId: 'admin-a', createdAt: new Date('2026-11-01T12:00:00Z'), tastingEventId: 'tasting-a', tasting: { startsAt: new Date('2026-11-05T20:00:00Z') }, comment: 'PRIVATE ADMIN NOTE' }];
      } },
      user: { findMany: async (query: any) => {
        assert.equal(query.where.organizationId, 'org-a');
        assert.deepEqual(Array.from(query.where.id.in), ['admin-a']);
        return [{ id: 'admin-a', name: 'Admin A' }];
      } },
    },
    accountWorklistWhere: () => ({ organizationId: 'org-a' }),
    getUserDisplayName: (user: { name: string }) => user.name,
    formatEasternDateTime: () => 'Nov 5 at 3:00 PM EST',
  });
  const result = await module.accountWorkAndEvents({ organizationId: 'org-a', accountType: 'AGENCY', accountId: 'agency-a', enabledFeatures: new Set(['TASTING_MANAGEMENT']) });
  assert.equal(workflowCalls.length, 1);
  assert.equal(result[0].href, '/tastings/tasting-a');
  assert.equal(result[0].actor, 'Admin A');
  assert.ok(!JSON.stringify(result).includes('PRIVATE ADMIN NOTE'));
});

test('dark tenants and Restaurant timelines do not load tasting workflow history', async () => {
  const empty = { findMany: async () => [] };
  const module = loadModule('lib/crm/accountTimeline.ts', {
    prisma: { worklistItem: empty, eventShift: empty, organizationAuditEvent: empty, tastingWorkflowEvent: { findMany: () => { throw new Error('Unexpected tasting history read.'); } } },
    accountWorklistWhere: () => ({ organizationId: 'org-a' }),
  });
  await module.accountWorkAndEvents({ organizationId: 'org-a', accountType: 'AGENCY', accountId: 'agency-a', enabledFeatures: new Set() });
  await module.accountWorkAndEvents({ organizationId: 'org-a', accountType: 'WHOLESALE', accountId: 'restaurant-a', enabledFeatures: new Set(['TASTING_MANAGEMENT']) });
});
