import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { Prisma, TastingEvent } from '@prisma/client';
import { addDaysToDateInputValue } from '../lib/dateTime';
import { getSchedulerWeekDates, isValidSchedulerDate } from '../lib/myDayWeekScheduler';
import { tastingExecutionStatus } from '../lib/tastings/model';
import { completeTastingFromVisit, requireTastingExecutionContext, tastingScheduleFingerprint } from '../lib/tastings/execution';

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

function executionFixture() {
  const now = new Date('2026-11-05T23:30:00Z');
  const actor = { organizationId: 'org-a', userId: 'taster-a' };
  const event = {
    id: 'tasting-a', organizationId: 'org-a', agencyId: 'agency-a', assignedTasterUserId: actor.userId,
    scheduledDate: new Date('2026-11-05'), startsAt: new Date('2026-11-05T23:00:00Z'), endsAt: new Date('2026-11-06T01:00:00Z'),
    tasterResponse: 'PENDING', agencyApproval: 'NOT_REQUESTED', stateApproval: 'NOT_SUBMITTED',
    cancelledAt: null, completedAt: null, completedVisitId: null, workflowStatusOverride: 'COMPLETED', version: 1,
  } as TastingEvent;
  const history: any[] = [];
  let writes = 0;
  let hasPhoto = true;
  const db = {
    $executeRaw: async () => 1,
    organizationFeature: { findFirst: async ({ where }: any) => where.organizationId === actor.organizationId ? { id: 'pilot' } : null },
    user: { findFirst: async ({ where }: any) => where.organizationId === actor.organizationId && where.id === actor.userId ? { id: actor.userId } : null },
    organization: { findFirst: async ({ where }: any) => where.id === actor.organizationId ? { id: actor.organizationId } : null },
    tastingEvent: {
      findFirst: async ({ where }: any) => where.organizationId === event.organizationId && where.id === event.id ? event : null,
      update: async ({ data }: any) => { writes++; Object.assign(event, { ...data, version: event.version + 1 }); return event; },
    },
    tastingWorkflowEvent: { create: async ({ data }: any) => { history.push(data); } },
    loggedVisit: { findFirst: async ({ where, include }: any) => {
      assert.equal(where.organizationId, actor.organizationId);
      assert.equal(where.tastingEventId, event.id);
      assert.equal(where.agencyId, event.agencyId);
      assert.equal(where.locationType, 'agency');
      assert.equal(where.createdByUserId, actor.userId);
      assert.equal(include.photos.where.organizationId, actor.organizationId);
      assert.equal(include.photos.where.storageKey.not, null);
      assert.equal(include.photos.where.contentType.startsWith, 'image/');
      assert.equal(include.photos.where.sizeBytes.gt, 0);
      return { id: 'visit-a', visitAt: now, photos: hasPhoto ? [{ id: 'photo-a' }] : [] };
    } },
  } as unknown as Prisma.TransactionClient;
  return { now, actor, event, history, db, writes: () => writes, removePhoto: () => { hasPhoto = false; } };
}

test('manual completion stays visibly distinct from physical Visit evidence and can still log the scheduled Visit', async () => {
  const f = executionFixture();
  assert.equal(tastingExecutionStatus(f.event, f.now), 'MANUALLY_COMPLETED');
  assert.equal((await requireTastingExecutionContext(f.db, f.actor, f.event.id, { now: f.now })).id, f.event.id);
  assert.equal(f.event.completedAt, null);
  assert.equal(f.event.completedVisitId, null);
  assert.equal(f.writes(), 0);
  f.removePhoto();
  await assert.rejects(completeTastingFromVisit(f.db, f.actor, { tastingId: f.event.id, visitId: 'visit-a', fingerprint: tastingScheduleFingerprint(f.event), now: f.now }), /verified photo/);
  assert.equal(f.event.workflowStatusOverride, 'COMPLETED');
  assert.equal(f.event.completedAt, null);
  assert.equal(f.writes(), 0);
  assert.equal(f.history.length, 0);
});

test('a real photo-backed Visit clears a manual workflow override and records both values without inventing approval milestones', async () => {
  const f = executionFixture();
  const input = { tastingId: f.event.id, visitId: 'visit-a', fingerprint: tastingScheduleFingerprint(f.event), now: f.now };
  await completeTastingFromVisit(f.db, f.actor, input);
  assert.equal(f.event.workflowStatusOverride, null);
  assert.equal(f.event.completedAt, f.now);
  assert.equal(f.event.completedVisitId, 'visit-a');
  assert.equal(f.event.agencyApproval, 'NOT_REQUESTED');
  assert.equal(f.event.stateApproval, 'NOT_SUBMITTED');
  assert.equal(f.history[0].oldValue.workflowStatusOverride, 'COMPLETED');
  assert.equal(f.history[0].oldValue.status, 'COMPLETED');
  assert.equal(f.history[0].newValue.workflowStatusOverride, null);
  assert.equal(f.history[0].newValue.status, 'COMPLETED');
  assert.equal(f.history[0].newValue.visitId, 'visit-a');
  f.event.workflowStatusOverride = 'CANCELLED';
  assert.equal(tastingExecutionStatus(f.event, f.now), 'COMPLETED');
  await completeTastingFromVisit(f.db, f.actor, input);
  assert.equal(f.writes(), 1);
  assert.equal(f.history.length, 1);
  await assert.rejects(requireTastingExecutionContext(f.db, { ...f.actor, userId: 'another-taster' }, f.event.id, { now: f.now, allowCompleted: true }), /unavailable|assigned/);
});

test('Visit entry follows the effective reopened status while retaining tenant, assignment, date and cancellation checks', async () => {
  const f = executionFixture();
  f.event.cancelledAt = f.now;
  f.event.agencyApproval = 'DENIED';
  f.event.stateApproval = 'DENIED';
  f.event.workflowStatusOverride = 'DRAFT';
  assert.ok(await requireTastingExecutionContext(f.db, f.actor, f.event.id, { now: f.now }));
  for (const workflowStatusOverride of ['CANCELLED', 'AGENCY_DENIED', 'STATE_DENIED', null]) {
    f.event.workflowStatusOverride = workflowStatusOverride;
    await assert.rejects(requireTastingExecutionContext(f.db, f.actor, f.event.id, { now: f.now }), /cancelled or denied/);
  }
  f.event.workflowStatusOverride = 'COMPLETED';
  await assert.rejects(requireTastingExecutionContext(f.db, { ...f.actor, organizationId: 'org-b' }, f.event.id, { now: f.now }), /unavailable|assigned/);
  await assert.rejects(requireTastingExecutionContext(f.db, f.actor, f.event.id, { now: new Date('2026-11-06T12:00:00Z') }), /scheduled date/);
});
