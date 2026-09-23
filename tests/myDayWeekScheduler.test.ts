import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {
  getSchedulerDayItems,
  getSchedulerPlanningTray,
  getSchedulerWeekDates,
} from '../lib/myDayWeekScheduler';

const item = (id: string, dueDate: string | null, dueTimeMinutes: number | null, status = 'OPEN') => ({ id, dueDate, dueTimeMinutes, status });

test('date-only work is Anytime while exact-time work is ordered into its time slot', () => {
  const items = [
    item('late', '2026-09-23', 14 * 60 + 30),
    item('anytime', '2026-09-23', null),
    item('early', '2026-09-23', 9 * 60),
    item('finished', '2026-09-23', 10 * 60, 'COMPLETED'),
  ];
  const day = getSchedulerDayItems(items, '2026-09-23');
  assert.deepEqual(day.timed.map(({ id }) => id), ['early', 'late']);
  assert.deepEqual(day.anytime.map(({ id }) => id), ['anytime']);
});

test('My Week uses Monday through Sunday and the same Worklist records as My Day', () => {
  const days = getSchedulerWeekDates('2026-09-23');
  assert.deepEqual(days, ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  const task = item('shared-task', '2026-09-23', 10 * 60);
  assert.deepEqual(getSchedulerDayItems([task], '2026-09-23').timed, getSchedulerDayItems([task], days[2]).timed);
});

test('planning tray includes overdue and undated active work, not completed work or the current week', () => {
  const tray = getSchedulerPlanningTray([
    item('old', '2026-09-01', null),
    item('undated', null, null),
    item('this-week', '2026-09-23', null),
    item('done', '2026-09-01', null, 'COMPLETED'),
  ], '2026-09-21');
  assert.deepEqual(tray.map(({ id }) => id), ['old', 'undated']);
});

function loadSchedulerActions({ owned = true } = {}) {
  const calls: Array<{ name: string; args?: any }> = [];
  const assignees = new Map([
    ['rep', { id: 'rep', email: 'rep@example.test', firstName: 'Rep', lastName: 'User', name: null }],
    ['teammate', { id: 'teammate', email: 'mate@example.test', firstName: 'Team', lastName: 'Mate', name: null }],
  ]);
  const enumValues = {
    WorklistCategory: { AGENCY: 'AGENCY', WHOLESALE: 'WHOLESALE', GENERAL: 'GENERAL' },
    WorklistSource: { MANUAL: 'MANUAL' },
    WorklistStatus: { OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' },
  };
  const module = { exports: {} as Record<string, unknown> };
  const context = {
    exports: module.exports,
    module,
    require: (name: string) => {
      if (name === '@prisma/client') return enumValues;
      if (name === 'next/cache') return { revalidatePath: (path: string) => calls.push({ name: 'revalidate', args: path }) };
      if (name.includes('/lib/auth')) return {
        getUserDisplayName: (user: any) => `${user.firstName} ${user.lastName}`,
        requireUser: async () => assignees.get('rep'),
      };
      if (name.includes('/lib/dateTime')) return {
        parseTimeInputToMinutes: (value: string) => {
          const match = value.match(/^(\d{2}):(\d{2})$/);
          return match ? Number(match[1]) * 60 + Number(match[2]) : null;
        },
      };
      if (name.includes('/lib/calendar/scheduleWorklistSync')) return { scheduleWorklistSync: (id: string) => calls.push({ name: 'calendar', args: id }) };
      if (name.includes('/lib/organizations')) return { requireOrganizationContext: async () => ({ organizationId: 'tenant' }) };
      if (name.includes('/lib/prisma')) return {
        prisma: {
          worklistItem: {
            findFirst: async ({ where }: any) => {
              calls.push({ name: 'find', args: where });
              assert.equal(where.organizationId, 'tenant');
              return owned ? { id: where.id } : null;
            },
            update: async (args: any) => { calls.push({ name: 'update', args }); return args; },
            create: async (args: any) => { calls.push({ name: 'create', args }); return { id: 'new-task' }; },
          },
          user: {
            findFirst: async ({ where }: any) => {
              calls.push({ name: 'find-assignee', args: where });
              return where.organizationId === 'tenant' ? assignees.get(where.id) ?? null : null;
            },
          },
          agency: { findUnique: async ({ where }: any) => ({ id: where.id }) },
          wholesaleAccount: { findFirst: async ({ where }: any) => ({ id: where.id }) },
        },
      };
      if (name.includes('/lib/worklistLocations')) return { getWorklistCategoryForLocationSelection: (category: string) => category };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    FormData,
    Date,
  };
  const source = readFileSync(new URL('../app/my-week/actions.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, context);
  return { actions: context.module.exports, calls };
}

test('drag/drop scheduling updates the existing tenant task in place and keeps all other context', async () => {
  const { actions, calls } = loadSchedulerActions();
  const form = new FormData();
  form.set('id', 'existing-task');
  form.set('dueDate', '2026-09-24');
  form.set('dueTime', '10:30');
  const result = await (actions.updateSchedulerWorklistItem as (data: FormData) => Promise<{ success?: string; error?: string }>)(form);
  assert.equal(result.success, 'Worklist schedule saved.');
  const update = calls.find((call) => call.name === 'update')!.args;
  assert.equal(update.where.id, 'existing-task');
  assert.equal(update.data.dueDate.toISOString(), '2026-09-24T00:00:00.000Z');
  assert.equal(update.data.dueTimeMinutes, 630);
  assert.deepEqual(Object.keys(update.data).sort(), ['dueDate', 'dueTimeMinutes']);
  assert.equal(calls.filter((call) => call.name === 'create').length, 0);
  assert.ok(calls.some((call) => call.name === 'calendar' && call.args === 'existing-task'));
});

test('reassignment updates the same task id with a validated in-tenant assignee', async () => {
  const { actions, calls } = loadSchedulerActions();
  const form = new FormData();
  form.set('id', 'existing-task');
  form.set('dueDate', '2026-09-24');
  form.set('dueTime', '');
  form.set('assignedToUserId', 'teammate');
  await (actions.updateSchedulerWorklistItem as (data: FormData) => Promise<unknown>)(form);
  const update = calls.find((call) => call.name === 'update')!.args;
  assert.equal(update.where.id, 'existing-task');
  assert.equal(update.data.assignedToUserId, 'teammate');
  assert.equal(update.data.assignedTo, 'Team Mate');
  assert.equal(calls.filter((call) => call.name === 'create').length, 0);
});

test('tenant-inaccessible tasks are rejected before schedule writes', async () => {
  const { actions, calls } = loadSchedulerActions({ owned: false });
  const form = new FormData();
  form.set('id', 'other-tenant-task');
  form.set('dueDate', '2026-09-24');
  form.set('dueTime', '10:00');
  const result = await (actions.updateSchedulerWorklistItem as (data: FormData) => Promise<{ success?: string; error?: string }>)(form);
  assert.match(result.error ?? '', /no longer active/);
  assert.equal(calls.filter((call) => call.name === 'update' || call.name === 'create' || call.name === 'calendar').length, 0);
});

test('calendar creation creates one normal Worklist row with selected account and schedule', async () => {
  const { actions, calls } = loadSchedulerActions();
  const form = new FormData();
  form.set('title', 'Visit Arena Wine & Spirits');
  form.set('category', 'WHOLESALE');
  form.set('wholesaleAccountId', 'account-1');
  form.set('dueDate', '2026-09-25');
  form.set('dueTime', '09:00');
  form.set('assignedToUserId', 'rep');
  form.set('detail', 'Review the new menu');
  const result = await (actions.createSchedulerWorklistItem as (data: FormData) => Promise<{ success?: string; error?: string }>)(form);
  assert.equal(result.success, 'Worklist task created.');
  const created = calls.find((call) => call.name === 'create')!.args.data;
  assert.equal(created.organizationId, 'tenant');
  assert.equal(created.source, 'MANUAL');
  assert.equal(created.wholesaleAccountId, 'account-1');
  assert.equal(created.assignedToUserId, 'rep');
  assert.equal(created.dueDate.toISOString(), '2026-09-25T00:00:00.000Z');
  assert.equal(created.dueTimeMinutes, 540);
  assert.equal(calls.filter((call) => call.name === 'create').length, 1);
  assert.ok(calls.some((call) => call.name === 'calendar' && call.args === 'new-task'));
});

test('My Schedule loads one tenant-scoped dataset for both day and week views', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /getSchedulerWeekDates\(anchorDate\)/);
  assert.match(page, /view === 'week' \? weekDates\[0\] : anchorDate/);
  assert.match(page, /view === 'week' \? weekDates\[6\] : anchorDate/);
  assert.match(page, /organizationId,/);
  assert.match(page, /assignedToUserId: user\.id/);
  assert.match(page, /status: \{ in: \[WorklistStatus\.OPEN, WorklistStatus\.IN_PROGRESS\] \}/);
  assert.match(page, /take: 300/);
  assert.match(page, /view=\{view\}/);

  const legacyRoute = readFileSync(new URL('../app/my-week/page.tsx', import.meta.url), 'utf8');
  assert.match(legacyRoute, /redirect\(`\/\?view=week/);
});

test('schedule tabs and date controls stay on the combined route and preserve the active view', () => {
  const scheduler = readFileSync(new URL('../app/my-week/WorklistScheduler.tsx', import.meta.url), 'utf8');
  assert.match(scheduler, /aria-label="Schedule view"/);
  assert.match(scheduler, /scheduleHref\('day', view === 'week' \? mobileDate : anchorDate\)/);
  assert.match(scheduler, /scheduleHref\('week', anchorDate\)/);
  assert.match(scheduler, /scheduleHref\(view, previousDate\)/);
  assert.match(scheduler, /scheduleHref\(view, nextDate\)/);
});
