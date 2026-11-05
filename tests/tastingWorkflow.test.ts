import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, UserRole, type TastingEvent } from '@prisma/client';
import { deriveTastingStatus, tastingConflicts, tastingExecutionStatus, tastingMinimumDays } from '../lib/tastings/model';
import { parseTastingSchedule, tastingDateKey, tastingLocalTimestamp } from '../lib/tastings/time';
import { saveTasting, transitionTasting, type TastingActor, type TastingDb } from '../lib/tastings/service';
import { importTastings, mapTastingImportStatus, previewTastingImport, TASTING_IMPORT_STATUSES } from '../lib/tastings/import';

const admin: TastingActor = { organizationId: 'org-a', userId: 'admin', role: UserRole.ADMIN };
const taster: TastingActor = { organizationId: 'org-a', userId: 'taster', role: UserRole.TASTER };
const now = new Date('2026-11-05T16:00:00.000Z');
const schedule = parseTastingSchedule('2026-11-20', '16:00', '18:00');
function base(overrides: Partial<TastingEvent> = {}): TastingEvent {
  return { id: 'tasting-1', organizationId: 'org-a', agencyId: 'agency-a', ...schedule, assignedTasterUserId: 'taster', contactId: null, tasterNotes: '', internalNotes: '', tasterResponse: 'PENDING', tasterRespondedAt: null, tasterRespondedByUserId: null, tasterResponseComment: null, approvedAssignment: null, agencyApproval: 'NOT_REQUESTED', agencyRequestedAt: null, agencyRequestedByUserId: null, agencyDecidedAt: null, agencyDecidedByUserId: null, agencyDecisionComment: null, stateApproval: 'NOT_SUBMITTED', stateSubmittedAt: null, stateSubmittedByUserId: null, stateDecidedAt: null, stateDecidedByUserId: null, stateDecisionComment: null, stateReference: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null, completedAt: null, completedVisitId: null, emailsGathered: null, postEventNotes: '', tasterFeedback: '', retailBottlesSold: null, salesProductBreakdown: null, salesDataSource: null, salesCalculatedAt: null, salesSourceDataThrough: null, salesSourceRevision: null, importKey: null, importMetadata: {}, importNeedsReview: false, submissionKey: null, version: 1, createdByUserId: 'admin', createdAt: now, updatedAt: now, ...overrides };
}
function fixture(initial: TastingEvent[] = []) {
  const rows = structuredClone(initial);
  const history: Array<Record<string, unknown>> = [];
  const lookups: Array<Record<string, unknown>> = [];
  const users = [
    { id: 'admin', organizationId: 'org-a', isActive: true, role: UserRole.ADMIN, name: 'Coordinator', email: 'admin@example.test' },
    { id: 'taster', organizationId: 'org-a', isActive: true, role: UserRole.TASTER, name: 'Taster', email: 'taster@example.test' },
    { id: 'taster-2', organizationId: 'org-a', isActive: true, role: UserRole.TASTER, name: 'Other Taster', email: 'other@example.test' },
    { id: 'b-user', organizationId: 'org-b', isActive: true, role: UserRole.ADMIN, name: 'Other Tenant', email: 'b@example.test' },
  ];
  let featureEnabled = true;
  let existingEvent: { id: string; title: string } | null = null;
  const fake = {
    $executeRaw: async () => 1,
    user: {
      findFirst: async ({ where }: Prisma.UserFindFirstArgs) => users.find(value => value.id === where?.id && value.organizationId === where?.organizationId) ?? null,
      findMany: async ({ where }: Prisma.UserFindManyArgs) => users.filter(value => value.organizationId === where?.organizationId && where.OR?.some(condition => condition.id === value.id || typeof condition.email === 'object' && 'equals' in condition.email && typeof condition.email.equals === 'string' && condition.email.equals.toLowerCase() === value.email.toLowerCase())),
    },
    organizationFeature: { findFirst: async () => featureEnabled ? { id: 'feature' } : null },
    organization: { findFirst: async () => ({ id: 'org-a', settings: {} }) },
    agency: {
      findFirst: async ({ where }: Prisma.AgencyFindFirstArgs) => ['agency-a', 'agency-b'].includes(where?.id as string) ? { id: where?.id, agencyId: where?.id === 'agency-a' ? '101' : '102' } : null,
      findMany: async ({ where }: Prisma.AgencyFindManyArgs) => where?.OR?.some(condition => condition.id === 'agency-a' || condition.agencyId === '101') ? [{ id: 'agency-a', name: 'Retail A' }] : [],
    },
    locationContact: { findFirst: async ({ where }: Prisma.LocationContactFindFirstArgs) => where?.organizationId === 'org-a' && (where?.agencyId === 'agency-a' || where?.OR?.some(value => value.agencyId === 'agency-a' || value.agencyId === '101')) && where?.id === 'contact-a' ? { id: 'contact-a' } : null },
    eventShift: { findFirst: async () => existingEvent },
    tastingEvent: {
      findFirst: async ({ where }: Prisma.TastingEventFindFirstArgs) => { lookups.push(where as Record<string, unknown>); return rows.find(value => value.id === where?.id && value.organizationId === where?.organizationId) ?? null; },
      findUnique: async ({ where }: Prisma.TastingEventFindUniqueArgs) => {
        if (where.organizationId_importKey) return rows.find(value => value.organizationId === where.organizationId_importKey?.organizationId && value.importKey === where.organizationId_importKey?.importKey) ?? null;
        if (where.organizationId_submissionKey) return rows.find(value => value.organizationId === where.organizationId_submissionKey?.organizationId && value.submissionKey === where.organizationId_submissionKey?.submissionKey) ?? null;
        return null;
      },
      findMany: async ({ where }: Prisma.TastingEventFindManyArgs) => rows.filter(value => value.organizationId === where?.organizationId).map(value => ({ ...value, assignedTaster: users.find(user => user.id === value.assignedTasterUserId) ?? null })),
      create: async ({ data }: { data: Record<string, unknown> }) => { const event = base({ ...data, id: `tasting-${rows.length + 1}` } as Partial<TastingEvent>); rows.push(event); return event; },
      update: async ({ where, data }: Prisma.TastingEventUpdateArgs) => {
        const event = rows.find(value => value.id === where.organizationId_id?.id && value.organizationId === where.organizationId_id?.organizationId)!;
        for (const [key, value] of Object.entries(data)) {
          if (key === 'version') event.version++;
          else (event as unknown as Record<string, unknown>)[key] = value === Prisma.DbNull ? null : value;
        }
        return event;
      },
    },
    tastingWorkflowEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { history.push(data); return data; } },
  };
  // Prisma returns detached records. Mutations in this fixture must not retroactively mutate snapshots.
  const read = fake.tastingEvent.findFirst;
  fake.tastingEvent.findFirst = async (args) => { const value = await read(args); return value ? structuredClone(value) : null; };
  return { db: fake as unknown as TastingDb, rows, history, lookups, disableFeature: () => { featureEnabled = false; }, overlapEvent: () => { existingEvent = { id: 'event', title: 'Training' }; } };
}
const createInput = (overrides: Record<string, unknown> = {}) => ({ agencyId: 'agency-a', assignedTasterUserId: 'taster', date: '2026-11-20', startTime: '16:00', endTime: '18:00', submissionKey: 'request-1', ...overrides });
async function act(f: ReturnType<typeof fixture>, action: string, actor = admin, extra: Record<string, unknown> = {}) {
  return transitionTasting(f.db, actor, { id: f.rows[0].id, version: f.rows[0].version, action, ...extra }, now);
}

test('draft creation uses IDs, real tenant user and NY schedule; replay is add-once', async () => {
  const f = fixture();
  const created = await saveTasting(f.db, admin, createInput(), now);
  assert.equal(created.startsAt.toISOString(), '2026-11-20T21:00:00.000Z');
  assert.equal(created.agencyApproval, 'NOT_REQUESTED');
  assert.equal(created.tasterResponse, 'PENDING');
  assert.equal(f.history[0].type, 'DRAFT_CREATED');
  await saveTasting(f.db, admin, createInput(), now);
  assert.equal(f.rows.length, 1); assert.equal(f.history.length, 1);
  await assert.rejects(saveTasting(f.db, admin, createInput({ assignedTasterUserId: 'b-user', submissionKey: 'request-2' })), /active taster/);
});
test('feature checks are server-side and administrative roles are not trusted from payload', async () => {
  const f = fixture(); f.disableFeature();
  await assert.rejects(saveTasting(f.db, admin, createInput()), /unavailable/);
  await assert.rejects(saveTasting(fixture().db, taster, createInput()), /Administrator/);
  await assert.rejects(saveTasting(fixture().db, { ...taster, role: UserRole.ADMIN }, createInput()), /unavailable/);
});
test('assigned taster approval captures exact assignment; no-op writes no history', async () => {
  const f = fixture([base()]);
  await act(f, 'TASTER_APPROVE', taster);
  assert.equal(f.rows[0].tasterResponse, 'APPROVED');
  assert.equal(f.rows[0].tasterRespondedByUserId, 'taster');
  assert.deepEqual(f.rows[0].approvedAssignment, { agencyId: 'agency-a', date: '2026-11-20', startsAt: '2026-11-20T21:00:00.000Z', endsAt: '2026-11-20T23:00:00.000Z', assignedTasterUserId: 'taster' });
  await act(f, 'TASTER_APPROVE', taster); assert.equal(f.history.length, 1);
  await assert.rejects(act(f, 'TASTER_APPROVE', admin), /Only the assigned/);
});
test('needs edit requires explanation and resets downstream current approvals while retaining history', async () => {
  const f = fixture([base({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED', stateApproval: 'APPROVED' })]);
  await assert.rejects(act(f, 'TASTER_NEEDS_EDIT', taster, { comment: ' ' }), /What needs to change/);
  await act(f, 'TASTER_NEEDS_EDIT', taster, { comment: 'I can work Friday after 5.' });
  assert.equal(f.rows[0].tasterResponseComment, 'I can work Friday after 5.');
  assert.equal(f.rows[0].agencyApproval, 'NOT_REQUESTED'); assert.equal(f.rows[0].stateApproval, 'NOT_SUBMITTED');
  assert.deepEqual(f.history.map(value => value.type), ['TASTER_NEEDS_EDIT', 'APPROVALS_RESET']);
});
test('Agency and state milestones record actors/times, cancellation preserves those milestones', async () => {
  const f = fixture([base()]);
  await act(f, 'TASTER_APPROVE', taster);
  await act(f, 'REQUEST_AGENCY_APPROVAL', admin, { contactId: 'contact-a' });
  assert.equal(f.rows[0].agencyRequestedByUserId, 'admin'); assert.equal(f.rows[0].contactId, 'contact-a');
  await act(f, 'AGENCY_APPROVE'); await act(f, 'SUBMIT_TO_STATE'); await act(f, 'STATE_APPROVE', admin, { stateReference: 'state-ref' });
  assert.equal(f.rows[0].stateDecidedByUserId, 'admin'); assert.equal(f.rows[0].stateReference, 'state-ref');
  await assert.rejects(act(f, 'CANCEL'), /cancellation reason/);
  await act(f, 'CANCEL', admin, { comment: 'Store closed for repairs.' });
  assert.equal(f.rows[0].agencyApproval, 'APPROVED'); assert.equal(f.rows[0].stateApproval, 'APPROVED');
  assert.equal(deriveTastingStatus(f.rows[0]), 'CANCELLED'); assert.equal(f.history.length, 6);
});
test('denied proposals are terminal and retain their denial reason', async () => {
  for (const [milestones, action] of [[{ tasterResponse: 'APPROVED', agencyApproval: 'REQUESTED' }, 'AGENCY_DENY'], [{ stateApproval: 'SUBMITTED' }, 'STATE_DENY']] as const) {
    const f = fixture([base(milestones)]);
    await act(f, action, admin, { comment: 'Date unavailable.' });
    await assert.rejects(act(f, 'REQUEST_AGENCY_APPROVAL'), /historical/);
    await assert.rejects(saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: f.rows[0].version })), /historical/);
    assert.equal(f.rows.length, 1); assert.equal(f.history[0].comment, 'Date unavailable.');
  }
});
test('normal forward transitions require their current prerequisite', async () => {
  const f = fixture([base()]);
  await assert.rejects(act(f, 'REQUEST_AGENCY_APPROVAL'), /taster response/);
  await assert.rejects(act(f, 'AGENCY_APPROVE'), /Request Agency/);
  await assert.rejects(act(f, 'SUBMIT_TO_STATE'), /taster and Agency/);
  await assert.rejects(act(f, 'STATE_APPROVE'), /state submission/);
});
test('rescheduling resets affected approvals and clears previous-date sales; reassignment resets only taster evidence', async () => {
  const f = fixture([base({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED', stateApproval: 'APPROVED', retailBottlesSold: 9, salesDataSource: 'DAILY_V3' })]);
  await saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: 1, assignedTasterUserId: 'taster-2' }));
  assert.equal(f.rows[0].tasterResponse, 'PENDING'); assert.equal(f.rows[0].agencyApproval, 'APPROVED'); assert.equal(f.rows[0].retailBottlesSold, 9);
  await saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: f.rows[0].version, date: '2026-11-21' }));
  assert.equal(f.rows[0].agencyApproval, 'NOT_REQUESTED'); assert.equal(f.rows[0].stateApproval, 'NOT_SUBMITTED'); assert.equal(f.rows[0].retailBottlesSold, null);
  assert.ok(f.history.some(value => value.type === 'DATE_TIME_CHANGED'));
});
test('changing Agency resets all approvals; notes-only save preserves approvals and no-op has no history', async () => {
  const f = fixture([base({ tasterResponse: 'APPROVED', agencyApproval: 'APPROVED', stateApproval: 'APPROVED' })]);
  await saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: 1, tasterNotes: 'Ask for Taylor.' }));
  assert.equal(f.rows[0].tasterResponse, 'APPROVED'); assert.equal(f.history.length, 1);
  await saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: f.rows[0].version, tasterNotes: 'Ask for Taylor.' }));
  assert.equal(f.history.length, 1);
  await saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: f.rows[0].version, agencyId: 'agency-b' }));
  assert.equal(f.rows[0].tasterResponse, 'PENDING'); assert.equal(f.rows[0].agencyApproval, 'NOT_REQUESTED'); assert.equal(f.rows[0].stateApproval, 'NOT_SUBMITTED');
});
test('same-store spacing blocks inside 10 days, permits day 10, and excludes terminal events', async () => {
  const old = base();
  assert.equal(tastingConflicts({ ...old, id: undefined, ...parseTastingSchedule('2026-11-29', '16:00', '18:00') }, [old]).spacing.length, 1);
  assert.equal(tastingConflicts({ ...old, id: undefined, ...parseTastingSchedule('2026-11-30', '16:00', '18:00') }, [old]).spacing.length, 0);
  for (const terminal of [{ cancelledAt: now }, { agencyApproval: 'DENIED' }, { stateApproval: 'DENIED' }, { completedAt: now }] satisfies Array<Partial<TastingEvent>>) assert.equal(tastingConflicts({ ...old, id: undefined }, [base(terminal)]).spacing.length, 0);
  assert.equal(tastingMinimumDays({ tastingMinimumDays: 14 }), 14); assert.equal(tastingMinimumDays({ tastingMinimumDays: -1 }), 10);
});
test('admin spacing override requires reason, records conflict IDs; overlap cannot be overridden', async () => {
  const f = fixture([base()]);
  await assert.rejects(saveTasting(f.db, admin, createInput({ date: '2026-11-25', submissionKey: 'another' })), /Allow 10 days/);
  await saveTasting(f.db, admin, createInput({ date: '2026-11-25', submissionKey: 'another', spacingOverrideReason: 'Owner-approved holiday promotion.' }));
  assert.equal(f.rows.length, 2); assert.equal(f.history.at(-1)?.type, 'SPACING_OVERRIDE');
  await assert.rejects(saveTasting(f.db, admin, createInput({ agencyId: 'agency-b', submissionKey: 'overlap', spacingOverrideReason: 'Override' })), /already assigned/);
  const event = fixture(); event.overlapEvent();
  await assert.rejects(saveTasting(event.db, admin, createInput()), /overlapping event: Training/);
});
test('terminal/completed schedule cannot be rewritten; late event is never assumed complete', async () => {
  const completed = fixture([base({ completedAt: now, completedVisitId: 'visit' })]);
  await assert.rejects(saveTasting(completed.db, admin, createInput({ id: 'tasting-1', version: 1 })), /historical/);
  assert.equal(tastingExecutionStatus(base(), new Date('2026-11-21T12:00Z')), 'VISIT_NOT_LOGGED');
  assert.equal(tastingExecutionStatus(base({ completedAt: now })), 'COMPLETED');
});
test('tenant and assigned-user boundaries reject foreign read/edit and contacts', async () => {
  const f = fixture([base({ organizationId: 'org-b' })]);
  await assert.rejects(act(f, 'CANCEL', admin, { comment: 'No.' }), /unavailable/);
  await assert.rejects(saveTasting(f.db, admin, createInput({ id: 'tasting-1', version: 1 })), /changed/);
  assert.ok(f.lookups.every(where => where.organizationId === 'org-a'));
  await assert.rejects(saveTasting(fixture().db, admin, createInput({ contactId: 'foreign-contact' })), /active contact/);
});
test('optimistic version prevents stale approval/edit after assignment changes', async () => {
  const f = fixture([base()]);
  await saveTasting(f.db, admin, createInput({ id: 'tasting-1', version: 1, date: '2026-11-21' }));
  await assert.rejects(transitionTasting(f.db, taster, { id: 'tasting-1', version: 1, action: 'TASTER_APPROVE' }), /changed/);
  assert.equal(f.history.filter(value => value.type === 'APPROVALS_RESET').length, 0, 'no no-op approval-reset history for an unapproved draft');
});
test('lightweight feedback preserves omitted existing values and unchanged feedback is a no-op', async () => {
  const f = fixture([base({ emailsGathered: 3, postEventNotes: 'Good attendance.' })]);
  await act(f, 'SAVE_FEEDBACK', taster, { tasterFeedback: 'Good turnout.' });
  assert.equal(f.rows[0].emailsGathered, 3); assert.equal(f.rows[0].postEventNotes, 'Good attendance.');
  await act(f, 'SAVE_FEEDBACK', taster, { tasterFeedback: 'Good turnout.' }); assert.equal(f.history.length, 1);
});
test('NY timezone conversion follows DST and rejects nonexistent/ambiguous/invalid wall times', () => {
  assert.equal(tastingLocalTimestamp('2026-07-01', '16:00').toISOString(), '2026-07-01T20:00:00.000Z');
  assert.equal(tastingDateKey(new Date('2026-11-21T02:00Z')), '2026-11-20');
  assert.throws(() => tastingLocalTimestamp('2026-03-08', '02:30'), /daylight saving/);
  assert.throws(() => tastingLocalTimestamp('2026-11-01', '01:30'), /daylight saving/);
  assert.throws(() => tastingLocalTimestamp('2026-02-30', '16:00'), /valid tasting date/);
  assert.throws(() => parseTastingSchedule('2026-11-20', '18:00', '16:00'), /End time/);
});
test('every spreadsheet visible status maps to discrete observed milestones without invented approvals', () => {
  for (const status of TASTING_IMPORT_STATUSES) assert.equal(mapTastingImportStatus(status).status, status);
  assert.deepEqual(mapTastingImportStatus('STATE_APPROVED').milestones, { tasterResponse: 'PENDING', agencyApproval: 'NOT_REQUESTED', stateApproval: 'APPROVED' });
  assert.deepEqual(mapTastingImportStatus('Agency Approved').milestones, { tasterResponse: 'PENDING', agencyApproval: 'APPROVED', stateApproval: 'NOT_SUBMITTED' });
  assert.throws(() => mapTastingImportStatus('Completed'), /Unknown spreadsheet status/);
});
const importRow = (overrides: Record<string, unknown> = {}) => ({ date: '2026-11-20', startTime: '16:00', endTime: '18:00', agencyId: '101', assignedTaster: 'taster@example.test', status: 'DRAFT', ...overrides });
test('import maps actual IDs/email; free-text names are retained for review rather than guessed', async () => {
  const f = fixture();
  const preview = await previewTastingImport(f.db, admin, [importRow(), importRow({ assignedTaster: 'Taster' })]);
  assert.equal(preview[0].assignedTasterUserId, 'taster'); assert.equal(preview[0].agencyId, 'agency-a');
  assert.equal(preview[1].assignedTasterUserId, null); assert.equal(preview[1].needsReview, true);
  const imported = await importTastings(f.db, admin, [importRow({ assignedTaster: 'Original Person', historicalBottles: '7' })], 'echo-sheet-export-1', now);
  assert.equal(imported.review, 1); assert.equal(f.rows[0].assignedTasterUserId, null); assert.equal(f.rows[0].retailBottlesSold, null);
  assert.equal((f.rows[0].importMetadata as Record<string, unknown>).originalTaster, 'Original Person');
  assert.equal((f.rows[0].importMetadata as Record<string, unknown>).historicalBottles, 7);
});
test('import replay is idempotent and does not overwrite Neat changes or spreadsheet note corrections', async () => {
  const f = fixture();
  const first = await importTastings(f.db, admin, [importRow()], 'source', now);
  assert.equal(first.created, 1);
  f.rows[0].tasterNotes = 'Updated in Neat';
  const replay = await importTastings(f.db, admin, [importRow({ tasterNotes: 'Changed in spreadsheet' })], 'source', now);
  assert.equal(replay.skipped, 1); assert.equal(replay.created, 0); assert.equal(f.rows[0].tasterNotes, 'Updated in Neat'); assert.equal(f.history.length, 1);
});
test('current sheet approver, non-unique Event_Key and sales text remain provenance; email count persists', async () => {
  const f = fixture();
  await importTastings(f.db, admin, [importRow({ originalApprover: 'Manager Pat', sourceEventKey: '11/20|Taster', historicalSalesNote: 'out of stock', emailsGathered: '4' })], 'current-tastings');
  const event = f.rows[0];
  assert.equal(event.contactId, null, 'free-text approver never becomes a guessed Contact ID');
  assert.equal(event.retailBottlesSold, null, 'text sales note is unknown, not zero');
  assert.equal(event.emailsGathered, 4);
  assert.equal((event.importMetadata as Record<string, unknown>).originalApprover, 'Manager Pat');
  assert.equal((event.importMetadata as Record<string, unknown>).sourceEventKey, '11/20|Taster');
  assert.equal((event.importMetadata as Record<string, unknown>).historicalSalesNote, 'out of stock');
  const second = await importTastings(f.db, admin, [importRow({ date: '2026-12-20', sourceEventKey: '11/20|Taster' })], 'current-tastings');
  assert.equal(second.created, 1, 'non-unique sheet Event_Key is not used as canonical import identity');
});
test('invalid spreadsheet rows fail preview and block all writes; import requires administrator', async () => {
  const f = fixture();
  const preview = await previewTastingImport(f.db, admin, [importRow({ agencyId: 'missing', status: 'unknown' })]);
  assert.equal(preview[0].errors.length, 2);
  await assert.rejects(importTastings(f.db, admin, [importRow(), importRow({ status: 'Completed' })], 'source'), /Resolve all/);
  assert.equal(f.rows.length, 0);
  await assert.rejects(previewTastingImport(f.db, taster, [importRow()]), /Administrator/);
});
