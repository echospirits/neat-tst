import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { Prisma, UserRole } from '@prisma/client';
import * as shared from '../lib/supportShared';

const source = readFileSync(new URL('../lib/support.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const id = (n = 1) => `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
type Row = Record<string, any>;

function harness(role: UserRole = UserRole.USER, organizationId: string | null = 'org-a', userId = 'reporter-a') {
  let session: Row | null = { id: userId, organizationId, role, isActive: true };
  let current: Row = { ...session };
  let tickets: Row[] = [], messages: Row[] = [], screenshots: Row[] = [];
  const calls: { model: string; method: string; args: Row }[] = [];
  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === 'OR') return condition.some((item: Row) => matches(row, item));
    if (key === 'ticket') return matches(tickets.find(item => item.id === row.ticketId) ?? {}, condition);
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('not' in condition) return row[key] !== condition.not;
      if ('in' in condition) return condition.in.includes(row[key]);
      if ('contains' in condition) return String(row[key] ?? '').toLowerCase().includes(condition.contains.toLowerCase());
      if ('gt' in condition) return row[key] > (condition.gt?.field ? row[condition.gt.field] : condition.gt);
      if ('gte' in condition) return row[key] >= condition.gte;
      if ('lt' in condition) return row[key] < condition.lt;
      return matches(row[key] ?? {}, condition);
    }
    return row[key] === condition;
  });
  const hydrate = (row: Row | undefined, args: Row): any => {
    if (!row) return null;
    const result: Row = { ...row, organization: { displayName: row.organizationId }, reporter: { id: row.reporterId, name: row.reporterId } };
    if (args.include?.screenshot) result.screenshot = screenshots.some(item => item.ticketId === row.id) ? { ticketId: row.id } : null;
    const messageConfig = args.include?.messages ?? args.select?.messages;
    if (messageConfig) result.messages = messages.filter(item => item.ticketId === row.id && matches(item, messageConfig.where ?? {})).map(item => ({ ...item, author: { id: item.authorId, name: item.authorId } }));
    return result;
  };
  const db: Row = { user: { findUnique: async () => current }, $queryRaw: async () => [] };
  db.supportTicket = {
    fields: { reporterReadVersion: { field: 'reporterReadVersion' } },
    findFirst: async (args: Row) => { calls.push({ model: 'ticket', method: 'findFirst', args }); return hydrate(tickets.find(row => matches(row, args.where)), args); },
    findUnique: async (args: Row) => tickets.find(row => matches(row, args.where)) ?? null,
    findMany: async (args: Row) => { calls.push({ model: 'ticket', method: 'findMany', args }); return tickets.filter(row => matches(row, args.where)).slice(args.skip ?? 0, (args.skip ?? 0) + args.take).map(row => hydrate(row, args)); },
    count: async (args: Row) => tickets.filter(row => matches(row, args.where)).length,
    create: async ({ data }: Row) => {
      const row = { id: `ticket-${tickets.length + 1}`, number: tickets.length + 1, status: 'OPEN', priority: 'NORMAL', version: 0, responseVersion: 0, reporterReadVersion: 0, anticipatedFixDate: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      if (data.screenshot) screenshots.push({ ticketId: row.id, ...data.screenshot.create });
      delete row.screenshot; tickets.push(row); return { id: row.id, number: row.number };
    },
    updateMany: async (args: Row) => {
      calls.push({ model: 'ticket', method: 'updateMany', args });
      const found = tickets.filter(row => matches(row, args.where));
      for (const row of found) for (const [key, value] of Object.entries(args.data) as [string, any][]) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
      return { count: found.length };
    },
  };
  db.supportMessage = {
    findUnique: async ({ where }: Row) => messages.find(row => matches(row, where)) ?? null,
    create: async ({ data }: Row) => { messages.push({ id: `message-${messages.length + 1}`, createdAt: new Date(), ...data }); return data; },
  };
  db.supportScreenshot = {
    findFirst: async (args: Row) => { calls.push({ model: 'screenshot', method: 'findFirst', args }); return screenshots.find(row => matches(row, args.where)) ?? null; },
    deleteMany: async ({ where }: Row) => { screenshots = screenshots.filter(row => !matches(row, where)); },
  };
  let tail = Promise.resolve();
  db.$transaction = (callback: (tx: Row) => Promise<any>) => {
    const run = tail.then(async () => {
      const before = { tickets: tickets.map(row => ({ ...row })), messages: messages.map(row => ({ ...row })), screenshots: [...screenshots] };
      try { return await callback(db); }
      catch (error) { tickets = before.tickets; messages = before.messages; screenshots = before.screenshots; throw error; }
    });
    tail = run.then(() => undefined, () => undefined); return run;
  };
  const exports: Row = {};
  const dependencies: Row = {
    '@prisma/client': { Prisma, UserRole }, zod: require('zod'), './auth': { getCurrentSession: async () => session ? { user: session } : null },
    './appEnvironment': { isSideEffectEnabled: () => true }, './organizations': { requireOrganizationContext: async () => ({ organizationId: 'org-a' }) },
    './prisma': { prisma: db }, './supportShared': shared,
  };
  runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, Buffer, Date, console });
  const service = exports as typeof import('../lib/support');
  return { service, calls, db, get tickets() { return tickets; }, get messages() { return messages; }, get screenshots() { return screenshots; },
    actor: (actor: Row | null, dbActor = actor) => { session = actor; if (dbActor) current = dbActor; },
    seed: (row: Row) => tickets.push({ id: 'ticket-1', number: 1, requestId: id(), organizationId: 'org-a', reporterId: 'reporter-a', title: 'Cannot save visit', description: 'I tried to save a visit but nothing happened.', category: 'BUG', status: 'OPEN', priority: 'NORMAL', version: 0, responseVersion: 0, reporterReadVersion: 0, anticipatedFixDate: null, createdAt: new Date(), updatedAt: new Date(), ...row }),
  };
}

const report = (requestId = id()) => ({ requestId, category: 'BUG', title: 'Cannot save visit', description: 'I tried to save a visit but nothing happened.' });
const reply = (version = 0, extra: Row = {}) => ({ requestId: id(2), version, body: 'Please retry the save.', action: 'reply', ...extra });
const forbidden = (error: any) => error.status === 403 || error.status === 404;

test('reports use authenticated tenant and reporter, validate fields and deduplicate retries', async () => {
  const h = harness();
  const result = await h.service.createSupportTicket({ ...report(), organizationId: 'org-b', reporterId: 'attacker', status: 'COMPLETE' }, { trail: [{ path: '/agencies/123?token=secret', at: new Date().toISOString() }], rawInputs: 'secret' });
  assert.equal(h.tickets[0].organizationId, 'org-a'); assert.equal(h.tickets[0].reporterId, 'reporter-a'); assert.equal(h.tickets[0].status, 'OPEN');
  assert.equal(h.tickets[0].diagnostics.trail[0].path, '/agencies/123'); assert.equal(h.tickets[0].diagnostics.rawInputs, undefined);
  assert.deepEqual({ ...await h.service.createSupportTicket(report(), {}) }, { ...result }); assert.equal(h.tickets.length, 1);
  await assert.rejects(h.service.createSupportTicket({ ...report(id(3)), description: '' }, {}), (error: any) => Boolean(error.fields.description));
});

test('anonymous and stale/disabled actors cannot create reports', async () => {
  const h = harness(); h.actor(null);
  await assert.rejects(h.service.createSupportTicket(report(), {}), (error: any) => error.status === 401);
  h.actor({ id: 'reporter-a', organizationId: 'org-a', role: 'USER', isActive: true }, { id: 'reporter-a', organizationId: 'org-b', role: 'USER', isActive: true });
  await assert.rejects(h.service.createSupportTicket(report(), {}), forbidden); assert.equal(h.tickets.length, 0);
});

test('report rate limiting is serialized and idempotent retries still work at the limit', async () => {
  const h = harness();
  for (let n = 1; n <= 10; n++) await h.service.createSupportTicket(report(id(n)), {});
  await h.service.createSupportTicket(report(id()), {});
  await assert.rejects(h.service.createSupportTicket(report(id(11)), {}), (error: any) => error.status === 429);
  assert.equal(h.tickets.length, 10);
});

for (const role of [UserRole.USER, UserRole.TASTER, UserRole.ADMIN]) {
  test(`${role} cannot read another tenant's tickets, screenshots or unread updates`, async () => {
    const h = harness(role); h.seed({ organizationId: 'org-b', responseVersion: 2 });
    h.screenshots.push({ ticketId: 'ticket-1', bytes: new Uint8Array([1]) });
    assert.equal((await h.service.listSupportTickets()).tickets.length, 0);
    await assert.rejects(h.service.getSupportTicket('ticket-1'), forbidden);
    await assert.rejects(h.service.getSupportScreenshot('ticket-1'), forbidden);
    await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply()), forbidden);
    await h.service.acknowledgeSupportUpdate('ticket-1', 2);
    assert.equal(h.tickets[0].reporterReadVersion, 0);
    assert.equal((await h.service.getUnreadSupportUpdates()).length, 0);
  });
}

test('users see only their own tickets; org admins see their organization but cannot reply on behalf of another reporter', async () => {
  const h = harness(); h.seed({ reporterId: 'other-reporter' });
  assert.equal((await h.service.listSupportTickets()).total, 0);
  h.actor({ id: 'admin-a', role: 'ADMIN', organizationId: 'org-a', isActive: true });
  assert.equal((await h.service.listSupportTickets()).total, 1);
  assert.equal((await h.service.getSupportTicket('ticket-1')).canReply, false);
  await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply()), forbidden);
  await assert.rejects(h.service.removeSupportScreenshot('ticket-1'), forbidden);
});

test('platform support is global without support-view context and private notes never leak to tenant views', async () => {
  const h = harness(UserRole.PLATFORM_ADMIN, null, 'platform'); h.seed({ organizationId: 'org-b' });
  assert.equal((await h.service.listSupportTickets()).total, 1);
  await h.service.replyToSupportTicket('ticket-1', reply(0, { action: 'note', body: 'Internal investigation only.' }));
  assert.equal(h.tickets[0].responseVersion, 0);
  assert.equal((await h.service.getSupportTicket('ticket-1')).ticket.messages.length, 1);
  h.actor({ id: 'admin-b', role: 'ADMIN', organizationId: 'org-b', isActive: true });
  assert.equal((await h.service.getSupportTicket('ticket-1')).ticket.messages.length, 0);
  const query = h.calls.filter(call => call.method === 'findFirst').at(-1)!;
  assert.equal(query.args.include.messages.where.isInternal, false);
});

test('public responses update status/date, notify only reporter, and retries do not duplicate messages or revisions', async () => {
  const h = harness(UserRole.PLATFORM_ADMIN, null, 'platform'); h.seed({});
  await h.service.replyToSupportTicket('ticket-1', reply(0, { status: 'PLANNED', anticipatedFixDate: '2026-10-30', priority: 'URGENT' }));
  await h.service.replyToSupportTicket('ticket-1', reply(0, { status: 'PLANNED', anticipatedFixDate: '2026-10-30', priority: 'URGENT' }));
  assert.equal(h.messages.length, 1); assert.equal(h.tickets[0].responseVersion, 1); assert.equal(h.tickets[0].status, 'PLANNED'); assert.equal(h.tickets[0].anticipatedFixDate.toISOString(), '2026-10-30T00:00:00.000Z');
  h.actor({ id: 'admin-a', role: 'ADMIN', organizationId: 'org-a', isActive: true }); assert.equal((await h.service.getUnreadSupportUpdates()).length, 0);
  h.actor({ id: 'reporter-a', role: 'USER', organizationId: 'org-a', isActive: true }); assert.equal((await h.service.getUnreadSupportUpdates()).length, 1);
  await h.service.acknowledgeSupportUpdate('ticket-1', 1); assert.equal((await h.service.getUnreadSupportUpdates()).length, 0);
});

test('acknowledging an older response cannot hide a newer reply or forge a future acknowledgement', async () => {
  const h = harness(); h.seed({ responseVersion: 2 });
  await h.service.acknowledgeSupportUpdate('ticket-1', 3); assert.equal(h.tickets[0].reporterReadVersion, 0);
  await h.service.acknowledgeSupportUpdate('ticket-1', 1); assert.equal(h.tickets[0].reporterReadVersion, 1); assert.equal((await h.service.getUnreadSupportUpdates()).length, 1);
  await h.service.acknowledgeSupportUpdate('ticket-1', 2); await h.service.acknowledgeSupportUpdate('ticket-1', 1); assert.equal(h.tickets[0].reporterReadVersion, 2);
});

test('a reporter can reopen complete/waiting tickets but cannot change priority/status, plan fixes or write private notes', async () => {
  for (const status of ['COMPLETE', 'WAITING_ON_USER']) {
    const h = harness(); h.seed({ status });
    await h.service.replyToSupportTicket('ticket-1', reply()); assert.equal(h.tickets[0].status, 'OPEN'); assert.equal(h.tickets[0].responseVersion, 0);
  }
  for (const extra of [{ status: 'COMPLETE' }, { priority: 'URGENT' }, { anticipatedFixDate: '2026-10-30' }, { action: 'note' }]) {
    const h = harness(); h.seed({}); await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply(0, extra)), forbidden); assert.equal(h.messages.length, 0);
  }
});

test('an unread answer preserves the support response status after the reporter reopens the ticket', async () => {
  const h = harness(UserRole.PLATFORM_ADMIN, null, 'platform'); h.seed({});
  await h.service.replyToSupportTicket('ticket-1', reply(0, { status: 'COMPLETE' }));
  h.actor({ id: 'reporter-a', role: 'USER', organizationId: 'org-a', isActive: true });
  await h.service.replyToSupportTicket('ticket-1', reply(1, { requestId: id(3) }));
  assert.equal(h.tickets[0].status, 'OPEN');
  assert.equal((await h.service.getUnreadSupportUpdates())[0].status, 'COMPLETE');
});

test('stale ticket revisions and demoted platform actors cannot overwrite a response', async () => {
  const h = harness(UserRole.PLATFORM_ADMIN, null, 'platform'); h.seed({ version: 2 });
  await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply(1, { status: 'COMPLETE' })), (error: any) => error.status === 409); assert.equal(h.messages.length, 0);
  h.actor({ id: 'platform', organizationId: null, role: 'PLATFORM_ADMIN', isActive: true }, { id: 'platform', organizationId: null, role: 'ADMIN', isActive: true });
  await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply(2)), forbidden); assert.equal(h.tickets[0].version, 2);
});

test('planned fixes require a valid date and completing a ticket requires a response', async () => {
  const h = harness(UserRole.PLATFORM_ADMIN); h.seed({});
  await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply(0, { status: 'PLANNED' })), (error: any) => Boolean(error.fields.anticipatedFixDate));
  await assert.rejects(h.service.replyToSupportTicket('ticket-1', reply(0, { status: 'COMPLETE', body: ' ' })), (error: any) => Boolean(error.fields.body));
  assert.equal(shared.supportReplySchema.safeParse(reply(0, { anticipatedFixDate: '2026-99-99' })).success, false);
  assert.equal(shared.supportReplySchema.safeParse(reply(0, { anticipatedFixDate: '2026-02-30' })).success, false);
});

test('screenshots are limited to small raster images and access/removal follow ticket ownership', async () => {
  const bytes = new Uint8Array([255, 216, 255, 0]);
  assert.equal(shared.validateSupportScreenshot(bytes, 'image/jpeg'), true);
  assert.equal(shared.validateSupportScreenshot(bytes, 'image/svg+xml'), false);
  assert.equal(shared.validateSupportScreenshot(new Uint8Array(shared.MAX_SUPPORT_SCREENSHOT_BYTES + 1), 'image/png'), false);
  const h = harness(); await h.service.createSupportTicket(report(), {}, { bytes, contentType: 'image/jpeg' });
  assert.equal((await h.service.getSupportScreenshot('ticket-1')).contentType, 'image/jpeg');
  await h.service.removeSupportScreenshot('ticket-1'); assert.equal(h.screenshots.length, 0);
  await assert.rejects(h.service.createSupportTicket(report(id(3)), {}, { bytes, contentType: 'image/svg+xml' }));
});

test('diagnostics drop raw data, private/token routes, stale pages, queries and mismatched users', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const result = shared.sanitizeSupportDiagnostics({ browser: 'Chrome', viewport: { width: 390, height: 844 }, password: 'secret', trail: [
    { path: '/search?q=private&token=secret#secret', at: now.toISOString() }, { path: '/reset-password/token', at: now.toISOString() },
    { path: '//evil.test', at: now.toISOString() }, { path: '/platform/organizations', at: now.toISOString() },
    { path: '/wholesale/123', at: '2026-10-09T11:00:00Z' },
  ] }, now);
  assert.deepEqual(result.trail, [{ path: '/search', at: now.toISOString() }]); assert.equal('password' in result, false);
  assert.equal(shared.safeSupportPath('/agencies/%2Fsecret'), null);
  const storage = { getItem: () => JSON.stringify({ scope: 'other-user:org-b', trail: [{ path: '/agencies/123', at: new Date().toISOString() }] }) };
  assert.deepEqual(shared.readSupportTrail(storage, 'reporter-a:org-a'), []);
  assert.equal(shared.supportReturnPath('/support?scope=mine&status=all&q=visit'), '/support?scope=mine&status=all&q=visit');
  assert.equal(shared.supportReturnPath('//evil.test'), '/support');
  assert.equal(shared.supportReturnPath('/support/new'), '/support');
});
