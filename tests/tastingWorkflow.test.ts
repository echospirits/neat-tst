import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, UserRole, type TastingEvent } from '@prisma/client';
import { deriveTastingStatus, isTerminalTasting, tastingConflicts, tastingExecutionStatus, tastingMinimumDays, TASTING_WORKFLOW_STATUSES } from '../lib/tastings/model';
import { parseTastingSchedule, tastingDateKey, tastingLocalTimestamp } from '../lib/tastings/time';
import { reassignTasting, saveTasting, transitionTasting, type TastingActor, type TastingDb } from '../lib/tastings/service';
import { importTastings, mapTastingImportStatus, previewTastingImport, TASTING_IMPORT_STATUSES } from '../lib/tastings/import';

const admin: TastingActor = { organizationId: 'org-a', userId: 'admin', role: UserRole.ADMIN };
const taster: TastingActor = { organizationId: 'org-a', userId: 'taster', role: UserRole.TASTER };
const sales: TastingActor = { organizationId: 'org-a', userId: 'rep', role: UserRole.USER };
const now = new Date('2026-11-05T16:00:00.000Z');
const schedule = parseTastingSchedule('2026-11-20', '16:00', '18:00');
function base(overrides: Partial<TastingEvent> = {}): TastingEvent {
  return { id: 'tasting-1', organizationId: 'org-a', agencyId: 'agency-a', ...schedule, assignedTasterUserId: 'taster', contactId: null, tasterNotes: '', internalNotes: '', workflowStatusOverride: null, tasterResponse: 'PENDING', tasterRespondedAt: null, tasterRespondedByUserId: null, tasterResponseComment: null, approvedAssignment: null, agencyApproval: 'NOT_REQUESTED', agencyRequestedAt: null, agencyRequestedByUserId: null, agencyDecidedAt: null, agencyDecidedByUserId: null, agencyDecisionComment: null, stateApproval: 'NOT_SUBMITTED', stateSubmittedAt: null, stateSubmittedByUserId: null, stateDecidedAt: null, stateDecidedByUserId: null, stateDecisionComment: null, stateReference: null, cancelledAt: null, cancelledByUserId: null, cancellationReason: null, completedAt: null, completedVisitId: null, emailsGathered: null, postEventNotes: '', tasterFeedback: '', retailBottlesSold: null, salesProductBreakdown: null, salesDataSource: null, salesCalculatedAt: null, salesSourceDataThrough: null, salesSourceRevision: null, importKey: null, importMetadata: {}, importNeedsReview: false, submissionKey: null, version: 1, createdByUserId: 'admin', createdAt: now, updatedAt: now, ...overrides };
}
function fixture(initial: TastingEvent[] = []) {
  const rows = structuredClone(initial);
  const history: Array<Record<string, unknown>> = [];
  const lookups: Array<Record<string, unknown>> = [];
  const updates: Prisma.TastingEventUpdateArgs[] = [];
  const users = [
    { id: 'admin', organizationId: 'org-a', isActive: true, role: UserRole.ADMIN, name: 'Coordinator', email: 'admin@example.test' },
    { id: 'taster', organizationId: 'org-a', isActive: true, role: UserRole.TASTER, name: 'Taster', email: 'taster@example.test' },
    { id: 'taster-2', organizationId: 'org-a', isActive: true, role: UserRole.TASTER, name: 'Other Taster', email: 'other@example.test' },
    { id: 'rep', organizationId: 'org-a', isActive: true, role: UserRole.USER, name: 'Other User', email: 'rep@example.test' },
    { id: 'b-user', organizationId: 'org-b', isActive: true, role: UserRole.ADMIN, name: 'Other Tenant', email: 'b@example.test' },
    { id: 'platform', organizationId: 'org-a', isActive: true, role: UserRole.PLATFORM_ADMIN, name: 'Platform', email: 'platform@example.test' },
  ];
  let featureEnabled = true;
  let existingEvent: { id: string; title: string } | null = null;
  const fake = {
    $executeRaw: async () => 1,
    user: {
      findFirst: async ({ where }: Prisma.UserFindFirstArgs) => users.find(value => value.id === where?.id && value.organizationId === where?.organizationId && (typeof where?.isActive !== 'boolean' || value.isActive === where.isActive) && (typeof where?.role !== 'object' || !where.role || !('not' in where.role) || value.role !== where.role.not)) ?? null,
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
        updates.push({ where, data });
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
  return { db: fake as unknown as TastingDb, rows, history, lookups, updates, disableFeature: () => { featureEnabled = false; }, deactivateUser: (id: string) => { const user = users.find(value => value.id === id); if (user) user.isActive = false; }, overlapEvent: () => { existingEvent = { id: 'event', title: 'Training' }; } };
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

test('inline reassignment permits Admin and Sales, reuses approval resets, and ignores unrelated payload fields', async () => {
  for (const actor of [admin, sales]) {
    const original = base({ workflowStatusOverride: 'STATE_APPROVED', tasterResponse: 'APPROVED', tasterRespondedAt: now, tasterRespondedByUserId: 'taster', tasterResponseComment: 'Ready', approvedAssignment: { userId: 'taster' }, agencyApproval: 'APPROVED', stateApproval: 'APPROVED', retailBottlesSold: 9, salesDataSource: 'DAILY_V3', tasterNotes: 'Keep this', internalNotes: 'PRIVATE', contactId: 'contact-a' });
    const f = fixture([original]);
    const updated = await reassignTasting(f.db, actor, { id: original.id, version: 1, assignedTasterUserId: 'taster-2', agencyId: 'agency-b', date: '2027-01-01', internalNotes: 'forged', tasterNotes: 'forged', workflowStatusOverride: 'COMPLETED' }, now);
    assert.equal(updated.assignedTasterUserId, 'taster-2');
    assert.equal(updated.version, 2);
    assert.equal(updated.tasterResponse, 'PENDING');
    assert.equal(updated.tasterRespondedAt, null); assert.equal(updated.tasterRespondedByUserId, null);
    assert.equal(updated.tasterResponseComment, null); assert.equal(updated.approvedAssignment, null);
    assert.equal(updated.workflowStatusOverride, null);
    assert.equal(updated.agencyApproval, 'APPROVED'); assert.equal(updated.stateApproval, 'APPROVED');
    assert.equal(updated.retailBottlesSold, 9); assert.equal(updated.salesDataSource, 'DAILY_V3');
    assert.equal(updated.agencyId, original.agencyId); assert.equal(updated.contactId, original.contactId);
    assert.equal(updated.tasterNotes, 'Keep this'); assert.equal(updated.internalNotes, 'PRIVATE');
    assert.equal(updated.startsAt.getTime(), original.startsAt.getTime()); assert.equal(updated.endsAt.getTime(), original.endsAt.getTime());
    assert.deepEqual(f.history.map(value => value.type), ['WORKFLOW_STATUS_RESET', 'TASTER_REASSIGNED', 'APPROVALS_RESET']);
    assert.ok(f.history.every(value => value.actorUserId === actor.userId && value.organizationId === actor.organizationId));
    assert.deepEqual(f.history.find(value => value.type === 'TASTER_REASSIGNED')?.oldValue, { userId: 'taster' });
    assert.deepEqual(f.history.find(value => value.type === 'TASTER_REASSIGNED')?.newValue, { userId: 'taster-2' });
    await assert.rejects(saveTasting(f.db, sales, createInput({ id: original.id, version: 2 })), /Administrator/);
  }
});

test('inline reassignment rejects Tasters, forged roles, inactive actors and a dark pilot before writes', async () => {
  for (const actor of [taster, { ...taster, role: UserRole.ADMIN }]) {
    const f = fixture([base()]);
    await assert.rejects(reassignTasting(f.db, actor, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2', role: 'ADMIN' }), /Sales access|unavailable/);
    assert.equal(f.lookups.length, 0); assert.equal(f.updates.length, 0); assert.equal(f.history.length, 0);
  }
  const inactive = fixture([base()]); inactive.deactivateUser(sales.userId);
  await assert.rejects(reassignTasting(inactive.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' }), /unavailable/);
  const dark = fixture([base()]); dark.disableFeature();
  await assert.rejects(reassignTasting(dark.db, admin, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' }), /unavailable/);
  assert.equal(inactive.updates.length, 0); assert.equal(dark.updates.length, 0);
});

test('inline reassignment enforces tenant, current version and active eligible assignee boundaries', async () => {
  for (const assignedTasterUserId of ['b-user', 'missing', 'platform', 'taster-2']) {
    const f = fixture([base()]);
    if (assignedTasterUserId === 'taster-2') f.deactivateUser(assignedTasterUserId);
    await assert.rejects(reassignTasting(f.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId }), /active taster/);
    assert.equal(f.updates.length, 0); assert.equal(f.history.length, 0);
  }
  const foreign = fixture([base({ organizationId: 'org-b' })]);
  await assert.rejects(reassignTasting(foreign.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' }), /unavailable/);
  assert.ok(foreign.lookups.every(value => value.organizationId === 'org-a'));
  const stale = fixture([base({ version: 2 })]);
  await assert.rejects(reassignTasting(stale.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' }), /changed/);
  assert.equal(stale.updates.length, 0); assert.equal(foreign.updates.length, 0);
});

test('inline reassignment keeps overlap and spacing restrictions without accepting forged overrides', async () => {
  for (const actor of [admin, sales]) {
    const overlap = fixture([base()]); overlap.overlapEvent();
    await assert.rejects(reassignTasting(overlap.db, actor, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' }), /overlapping event/);
    const spacing = fixture([base(), base({ id: 'nearby', assignedTasterUserId: 'rep', ...parseTastingSchedule('2026-11-25', '16:00', '18:00') })]);
    await assert.rejects(reassignTasting(spacing.db, actor, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2', spacingOverrideReason: 'Forged override' }), /administrator override/);
    assert.equal(overlap.updates.length, 0); assert.equal(spacing.updates.length, 0);
  }
});

test('inline reassignment preserves historical locks, reopened evidence and no-op idempotency', async () => {
  for (const historical of [base({ completedAt: now, completedVisitId: 'real-visit', workflowStatusOverride: 'DRAFT' }), ...(['CANCELLED', 'AGENCY_DENIED', 'STATE_DENIED', 'COMPLETED'] as const).map(workflowStatusOverride => base({ workflowStatusOverride }))]) {
    const f = fixture([historical]);
    await assert.rejects(reassignTasting(f.db, admin, { id: historical.id, version: 1, assignedTasterUserId: 'taster-2' }), /historical/);
    assert.equal(f.updates.length, 0); assert.equal(f.history.length, 0);
  }
  const reopened = fixture([base({ workflowStatusOverride: 'DRAFT', cancelledAt: now, cancellationReason: 'Prior cancellation', agencyApproval: 'DENIED', stateApproval: 'DENIED' })]);
  await reassignTasting(reopened.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' });
  assert.equal(deriveTastingStatus(reopened.rows[0]), 'NEEDS_TASTER_RESPONSE');
  assert.equal(reopened.rows[0].cancellationReason, 'Prior cancellation'); assert.equal(reopened.rows[0].agencyApproval, 'DENIED'); assert.equal(reopened.rows[0].stateApproval, 'DENIED');
  const noOp = fixture([base({ workflowStatusOverride: 'STATE_APPROVED' })]);
  await reassignTasting(noOp.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster' });
  assert.equal(noOp.rows[0].version, 1); assert.equal(noOp.rows[0].workflowStatusOverride, 'STATE_APPROVED');
  assert.equal(noOp.updates.length, 0); assert.equal(noOp.history.length, 0);
});

test('reassignment revokes old taster mutation authority and stale writes cannot replace a newer assignment', async () => {
  const f = fixture([base()]);
  await reassignTasting(f.db, sales, { id: 'tasting-1', version: 1, assignedTasterUserId: 'taster-2' });
  await assert.rejects(reassignTasting(f.db, admin, { id: 'tasting-1', version: 1, assignedTasterUserId: 'rep' }), /changed/);
  await assert.rejects(act(f, 'SET_STATUS', taster, { status: 'STATE_APPROVED' }), /assigned taster/);
  await act(f, 'SET_STATUS', { ...taster, userId: 'taster-2' }, { status: 'STATE_APPROVED' });
  assert.equal(f.rows[0].assignedTasterUserId, 'taster-2'); assert.equal(deriveTastingStatus(f.rows[0]), 'STATE_APPROVED');
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

const manualStatuses = [
  'DRAFT', 'NEEDS_TASTER_RESPONSE', 'TASTER_APPROVED', 'TASTER_NEEDS_EDIT',
  'REQUESTED_AGENCY_APPROVAL', 'AGENCY_APPROVED', 'AGENCY_DENIED', 'SUBMITTED_TO_STATE',
  'STATE_APPROVED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED',
] as const;
type ManualStatus = typeof manualStatuses[number];
const manualNow = new Date('2026-11-21T12:00:00.000Z');
const approvalTime = new Date('2026-11-19T15:00:00.000Z');
const completionTime = new Date('2026-11-20T23:05:00.000Z');

function manualSource(status: ManualStatus): TastingEvent {
  const event = base({ workflowStatusOverride: status, importNeedsReview: true, importMetadata: { originalTaster: 'Original Person', sourceEventKey: 'not-unique', milestoneActorsAndTimesUnverified: true }, importKey: 'retained-import-key', internalNotes: 'Coordinator evidence stays private.', tasterNotes: 'Saved preparation.', emailsGathered: 4, postEventNotes: 'Saved feedback.', retailBottlesSold: 7 });
  if (!['DRAFT', 'NEEDS_TASTER_RESPONSE', 'TASTER_NEEDS_EDIT'].includes(status)) Object.assign(event, {
    tasterResponse: 'APPROVED', tasterRespondedAt: approvalTime, tasterRespondedByUserId: 'taster',
    approvedAssignment: { agencyId: event.agencyId, assignedTasterUserId: 'taster', date: '2026-11-20', startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() },
  });
  if (status === 'TASTER_NEEDS_EDIT') Object.assign(event, { tasterResponse: 'NEEDS_EDIT', tasterResponseComment: 'Original edit explanation.', tasterRespondedAt: approvalTime, tasterRespondedByUserId: 'taster' });
  if (['REQUESTED_AGENCY_APPROVAL', 'AGENCY_APPROVED', 'AGENCY_DENIED', 'SUBMITTED_TO_STATE', 'STATE_APPROVED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED'].includes(status)) Object.assign(event, { agencyApproval: 'REQUESTED', agencyRequestedAt: approvalTime, agencyRequestedByUserId: 'admin' });
  if (['AGENCY_APPROVED', 'SUBMITTED_TO_STATE', 'STATE_APPROVED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED'].includes(status)) Object.assign(event, { agencyApproval: 'APPROVED', agencyDecidedAt: approvalTime, agencyDecidedByUserId: 'admin' });
  if (status === 'AGENCY_DENIED') Object.assign(event, { agencyApproval: 'DENIED', agencyDecidedAt: approvalTime, agencyDecidedByUserId: 'admin', agencyDecisionComment: 'Original store denial.' });
  if (['SUBMITTED_TO_STATE', 'STATE_APPROVED', 'STATE_DENIED', 'CANCELLED', 'COMPLETED'].includes(status)) Object.assign(event, { stateApproval: 'SUBMITTED', stateSubmittedAt: approvalTime, stateSubmittedByUserId: 'admin' });
  if (['STATE_APPROVED', 'CANCELLED', 'COMPLETED'].includes(status)) Object.assign(event, { stateApproval: 'APPROVED', stateDecidedAt: approvalTime, stateDecidedByUserId: 'admin', stateReference: 'retained-state-reference' });
  if (status === 'STATE_DENIED') Object.assign(event, { stateApproval: 'DENIED', stateDecidedAt: approvalTime, stateDecidedByUserId: 'admin', stateDecisionComment: 'Original state denial.' });
  if (status === 'CANCELLED') Object.assign(event, { cancelledAt: approvalTime, cancelledByUserId: 'admin', cancellationReason: 'Original cancellation reason.' });
  if (status === 'COMPLETED') Object.assign(event, { completedAt: completionTime, completedVisitId: 'visit-with-photo' });
  return event;
}

function setStatus(f: ReturnType<typeof fixture>, status: string | undefined, actor = admin, extra: Record<string, unknown> = {}) {
  return transitionTasting(f.db, actor, { id: f.rows[0].id, version: f.rows[0].version, action: 'SET_STATUS', status, comment: `Reason for ${status}.`, ...extra }, manualNow);
}
function preservedEvidence(event: TastingEvent) {
  const { workflowStatusOverride: _status, version: _version, updatedAt: _updatedAt, ...evidence } = event;
  return evidence;
}

test('the manual pilot offers exactly twelve workflow choices and excludes the import-review system state', () => {
  assert.deepEqual([...TASTING_WORKFLOW_STATUSES].sort(), [...manualStatuses].sort());
});

for (const actor of [admin, taster]) {
  test(`${actor.role} can choose every source-to-target manual status pair while original evidence and history remain intact`, async () => {
    let checked = 0;
    for (const source of manualStatuses) for (const target of manualStatuses) {
      const f = fixture([manualSource(source)]);
      const before = structuredClone(f.rows[0]);
      const changed = await setStatus(f, target, actor);
      const context = `${actor.role}: ${source} → ${target}`;
      assert.equal(deriveTastingStatus(changed), target, context);
      assert.equal(changed.assignedTasterUserId, 'taster', context);
      assert.deepEqual(preservedEvidence(changed), preservedEvidence(before), context);
      assert.equal(f.updates.length, source === target ? 0 : 1, context);
      assert.equal(changed.version, before.version + (source === target ? 0 : 1), context);
      assert.equal(f.history.length, source === target ? 0 : 1, context);
      if (source !== target) {
        assert.deepEqual(f.updates[0].where, { organizationId_id: { organizationId: 'org-a', id: before.id } }, context);
        const entry = f.history[0];
        assert.equal(entry.organizationId, actor.organizationId, context);
        assert.equal(entry.tastingEventId, before.id, context);
        assert.equal(entry.actorUserId, actor.userId, context);
        assert.equal(entry.type, 'WORKFLOW_STATUS_CHANGED', context);
        assert.equal(entry.createdAt, manualNow, context);
        assert.equal(entry.comment, `Reason for ${target}.`, context);
        const oldValue = entry.oldValue as Record<string, unknown>;
        const newValue = entry.newValue as Record<string, unknown>;
        assert.equal(oldValue.status, source, context);
        assert.equal(oldValue.workflowStatusOverride, source, context);
        assert.equal(newValue.status, target, context);
        assert.equal(newValue.workflowStatusOverride, target, context);
        assert.equal(oldValue.completedVisitId, before.completedVisitId, context);
        assert.equal(newValue.completedVisitId, before.completedVisitId, context);
      }
      checked++;
    }
    assert.equal(checked, 144);
  });
}

test('manual State Approved can be chosen up front without inventing earlier approval evidence', async () => {
  for (const actor of [admin, taster]) {
    const f = fixture([base()]);
    const approved = await setStatus(f, 'STATE_APPROVED', actor);
    assert.equal(deriveTastingStatus(approved), 'STATE_APPROVED');
    assert.equal(approved.tasterResponse, 'PENDING');
    assert.equal(approved.agencyApproval, 'NOT_REQUESTED');
    assert.equal(approved.stateApproval, 'NOT_SUBMITTED');
    assert.equal(approved.approvedAssignment, null);
    assert.equal(approved.tasterRespondedAt, null);
    assert.equal(approved.agencyDecidedByUserId, null);
    assert.equal(approved.stateSubmittedAt, null);
    assert.equal(approved.stateDecidedAt, null);
    assert.equal(f.history.length, 1);
    assert.equal((f.history[0].oldValue as Record<string, unknown>).workflowStatusOverride, null);
  }
});

test('manual backwards and Draft choices retain the exact assigned schedule and underlying milestone evidence', async () => {
  const f = fixture([manualSource('STATE_APPROVED')]);
  const original = structuredClone(f.rows[0]);
  for (const status of ['TASTER_APPROVED', 'REQUESTED_AGENCY_APPROVAL', 'DRAFT'] as const) {
    const changed = await setStatus(f, status, taster);
    assert.equal(deriveTastingStatus(changed), status);
    assert.equal(changed.assignedTasterUserId, original.assignedTasterUserId);
    assert.equal(changed.agencyId, original.agencyId);
    assert.equal(changed.scheduledDate.getTime(), original.scheduledDate.getTime());
    assert.equal(changed.startsAt.getTime(), original.startsAt.getTime());
    assert.equal(changed.endsAt.getTime(), original.endsAt.getTime());
    assert.deepEqual(changed.approvedAssignment, original.approvedAssignment);
    assert.deepEqual(preservedEvidence(changed), preservedEvidence(original));
  }
  assert.deepEqual(f.history.map(entry => (entry.newValue as Record<string, unknown>).status), ['TASTER_APPROVED', 'REQUESTED_AGENCY_APPROVAL', 'DRAFT']);
});

test('reselecting a derived or manually selected current status performs no update, version bump or history write', async () => {
  for (const event of [base(), base({ tasterResponse: 'APPROVED' }), manualSource('DRAFT'), manualSource('CANCELLED'), manualSource('COMPLETED')]) {
    const f = fixture([event]);
    const original = structuredClone(f.rows[0]);
    await setStatus(f, deriveTastingStatus(event), taster, { comment: 'A different comment still does not repeat a status transition.' });
    assert.deepEqual(f.rows[0], original);
    assert.equal(f.updates.length, 0);
    assert.equal(f.history.length, 0);
  }
});

test('invalid, missing and import-review manual status inputs are rejected without mutation', async () => {
  for (const actor of [admin, taster]) for (const status of [undefined, '', 'NOT_A_STATUS', 'IMPORT_REVIEW']) {
    const f = fixture([base()]);
    await assert.rejects(setStatus(f, status, actor));
    assert.equal(f.rows[0].workflowStatusOverride, null);
    assert.equal(f.rows[0].version, 1);
    assert.equal(f.updates.length, 0);
    assert.equal(f.history.length, 0);
  }
});

test('manual Needs Edit and Cancelled require a nonblank reason for both administrators and assigned tasters', async () => {
  for (const actor of [admin, taster]) for (const status of ['TASTER_NEEDS_EDIT', 'CANCELLED']) {
    const f = fixture([base()]);
    await assert.rejects(setStatus(f, status, actor, { comment: ' \n ' }), status === 'TASTER_NEEDS_EDIT' ? /What needs to change/ : /cancellation reason/);
    assert.equal(f.updates.length, 0); assert.equal(f.history.length, 0);
    await setStatus(f, status, actor, { comment: '  This date no longer works.  ' });
    assert.equal(f.history[0].comment, 'This date no longer works.');
    assert.equal(f.rows[0].tasterResponse, 'PENDING');
    assert.equal(f.rows[0].cancelledAt, null);
    assert.equal(f.rows[0].cancelledByUserId, null);
  }
});

test('manual status changes reject other assignees, unrelated users, foreign tenants and forged actors', async () => {
  const otherTaster = { ...taster, userId: 'taster-2' };
  const otherUser = { ...taster, userId: 'rep', role: UserRole.USER };
  for (const actor of [otherTaster, otherUser, { ...taster, role: UserRole.ADMIN }, { ...admin, organizationId: 'org-b' }]) {
    const f = fixture([base()]);
    await assert.rejects(setStatus(f, 'STATE_APPROVED', actor), /assigned taster|unavailable/);
    assert.equal(f.updates.length, 0); assert.equal(f.history.length, 0);
  }
  const foreign = fixture([base({ organizationId: 'org-b' })]);
  await assert.rejects(setStatus(foreign, 'DRAFT', admin), /unavailable/);
  assert.ok(foreign.lookups.every(where => where.organizationId === 'org-a'));
  assert.equal(foreign.updates.length, 0); assert.equal(foreign.history.length, 0);
});

test('manual status changes reject inactive users, disabled pilots and stale optimistic versions, even for no-op choices', async () => {
  for (const actor of [admin, taster]) {
    const inactive = fixture([base()]); inactive.deactivateUser(actor.userId);
    await assert.rejects(setStatus(inactive, 'STATE_APPROVED', actor), /unavailable/);
    const disabled = fixture([base()]); disabled.disableFeature();
    await assert.rejects(setStatus(disabled, 'STATE_APPROVED', actor), /unavailable/);
    const stale = fixture([manualSource('DRAFT')]);
    await assert.rejects(setStatus(stale, 'DRAFT', actor, { version: 2 }), /changed/);
    for (const f of [inactive, disabled, stale]) {
      assert.equal(f.updates.length, 0); assert.equal(f.history.length, 0);
    }
  }
});

test('manual Completed changes the workflow label without creating Visit or photo completion evidence', async () => {
  for (const actor of [admin, taster]) {
    const f = fixture([base()]);
    const changed = await setStatus(f, 'COMPLETED', actor);
    assert.equal(deriveTastingStatus(changed), 'COMPLETED');
    assert.equal(changed.completedAt, null);
    assert.equal(changed.completedVisitId, null);
    assert.equal(tastingExecutionStatus(changed, manualNow), 'MANUALLY_COMPLETED');
    assert.equal(changed.tasterRespondedAt, null);
    assert.equal(changed.agencyRequestedAt, null);
    assert.equal(changed.stateDecidedAt, null);
    assert.equal(f.history[0].type, 'WORKFLOW_STATUS_CHANGED');
    assert.equal((f.history[0].newValue as Record<string, unknown>).completedVisitId, null);
    assert.ok(!f.history.some(entry => entry.type === 'TASTING_COMPLETED'));
  }
});

test('changing every manual status after a photo-backed Visit retains the original Visit/photo IDs and execution fact', async () => {
  for (const actor of [admin, taster]) {
    const f = fixture([manualSource('COMPLETED')]);
    const visit = { id: 'visit-with-photo', organizationId: 'org-a', tastingEventId: f.rows[0].id, agencyId: 'agency-a', createdByUserId: 'taster', visitAt: new Date('2026-11-20T22:55:00Z') };
    const photo = { id: 'original-proof-photo', organizationId: 'org-a', loggedVisitId: visit.id, storageKey: 'test/retained-proof.jpg' };
    const originalEvidence = structuredClone({ visit, photo });
    const denyEvidenceWrite = async () => { assert.fail('A manual status change must not write, replace or delete Visit/photo evidence.'); };
    Object.assign(f.db, { loggedVisit: { findFirst: async () => visit, create: denyEvidenceWrite, update: denyEvidenceWrite, delete: denyEvidenceWrite }, visitPhoto: { findFirst: async () => photo, create: denyEvidenceWrite, update: denyEvidenceWrite, delete: denyEvidenceWrite } });
    for (const status of manualStatuses) {
      const changed = await setStatus(f, status, actor);
      assert.equal(deriveTastingStatus(changed), status);
      assert.equal(changed.completedVisitId, visit.id);
      assert.equal(changed.completedAt?.getTime(), completionTime.getTime());
      assert.equal(tastingExecutionStatus(changed, manualNow), 'COMPLETED');
      assert.deepEqual({ visit, photo }, originalEvidence);
    }
    assert.equal(photo.id, 'original-proof-photo');
    assert.equal(photo.loggedVisitId, f.rows[0].completedVisitId);
  }
});

test('material schedule changes reset the manual choice with an audit; reopened denials/cancellations remain active while real Visit completion stays protected', async () => {
  for (const change of [
    { date: '2026-11-22' }, { assignedTasterUserId: 'taster-2' }, { agencyId: 'agency-b' },
  ]) {
    const f = fixture([manualSource('STATE_APPROVED')]);
    const old = structuredClone(f.rows[0]);
    const updated = await saveTasting(f.db, admin, createInput({ id: old.id, version: old.version, tasterNotes: old.tasterNotes, internalNotes: old.internalNotes, ...change }), manualNow);
    assert.equal(updated.workflowStatusOverride, null);
    assert.equal(updated.tasterResponse, 'PENDING');
    assert.equal(updated.version, old.version + 1);
    const reset = f.history.filter(entry => entry.type === 'WORKFLOW_STATUS_RESET');
    assert.equal(reset.length, 1);
    assert.equal(reset[0].organizationId, admin.organizationId);
    assert.equal(reset[0].actorUserId, admin.userId);
    assert.equal(reset[0].tastingEventId, old.id);
    assert.equal(reset[0].createdAt, manualNow);
    assert.deepEqual(reset[0].oldValue, { status: 'STATE_APPROVED', workflowStatusOverride: 'STATE_APPROVED' });
    assert.deepEqual(reset[0].newValue, { status: deriveTastingStatus(updated), workflowStatusOverride: null });
    assert.match(String(reset[0].comment), /revised proposal/);
    assert.ok(f.history.some(entry => ['DATE_TIME_CHANGED', 'TASTER_REASSIGNED', 'AGENCY_CHANGED'].includes(String(entry.type))));
  }
  for (const source of ['AGENCY_DENIED', 'STATE_DENIED', 'CANCELLED'] as const) {
    const f = fixture([manualSource(source)]);
    await setStatus(f, 'DRAFT', taster);
    assert.equal(f.rows[0].completedAt, null);
    const before = structuredClone(f.rows[0]);
    const revised = await saveTasting(f.db, admin, createInput({ id: f.rows[0].id, version: f.rows[0].version, date: '2026-11-22' }), manualNow);
    assert.equal(revised.scheduledDate.toISOString().slice(0, 10), '2026-11-22');
    assert.equal(revised.workflowStatusOverride, source === 'CANCELLED' ? 'NEEDS_TASTER_RESPONSE' : null);
    assert.equal(deriveTastingStatus(revised), 'NEEDS_TASTER_RESPONSE');
    assert.equal(isTerminalTasting(revised), false);
    assert.equal(revised.cancelledAt?.getTime(), before.cancelledAt?.getTime());
    assert.equal(revised.cancelledByUserId, before.cancelledByUserId);
    assert.equal(revised.cancellationReason, before.cancellationReason);
    const reset = f.history.find(entry => entry.type === 'WORKFLOW_STATUS_RESET')!;
    assert.deepEqual(reset.oldValue, { status: 'DRAFT', workflowStatusOverride: 'DRAFT' });
    assert.deepEqual(reset.newValue, { status: 'NEEDS_TASTER_RESPONSE', workflowStatusOverride: revised.workflowStatusOverride });
  }
  for (const source of ['AGENCY_DENIED', 'STATE_DENIED'] as const) {
    const f = fixture([manualSource(source)]);
    await setStatus(f, 'DRAFT', taster);
    const before = structuredClone(f.rows[0]);
    const revised = await saveTasting(f.db, admin, createInput({ id: before.id, version: before.version, assignedTasterUserId: 'taster-2', tasterNotes: before.tasterNotes, internalNotes: before.internalNotes }), manualNow);
    assert.equal(revised.assignedTasterUserId, 'taster-2');
    assert.equal(revised.workflowStatusOverride, 'NEEDS_TASTER_RESPONSE');
    assert.equal(deriveTastingStatus(revised), 'NEEDS_TASTER_RESPONSE');
    assert.equal(isTerminalTasting(revised), false);
    assert.equal(revised.tasterResponse, 'PENDING');
    assert.equal(revised.agencyApproval, before.agencyApproval);
    assert.equal(revised.agencyDecidedByUserId, before.agencyDecidedByUserId);
    assert.equal(revised.agencyDecidedAt?.getTime(), before.agencyDecidedAt?.getTime());
    assert.equal(revised.agencyDecisionComment, before.agencyDecisionComment);
    assert.equal(revised.stateApproval, before.stateApproval);
    assert.equal(revised.stateDecidedByUserId, before.stateDecidedByUserId);
    assert.equal(revised.stateDecidedAt?.getTime(), before.stateDecidedAt?.getTime());
    assert.equal(revised.stateDecisionComment, before.stateDecisionComment);
    const reset = f.history.find(entry => entry.type === 'WORKFLOW_STATUS_RESET')!;
    assert.deepEqual(reset.oldValue, { status: 'DRAFT', workflowStatusOverride: 'DRAFT' });
    assert.deepEqual(reset.newValue, { status: 'NEEDS_TASTER_RESPONSE', workflowStatusOverride: 'NEEDS_TASTER_RESPONSE' });
  }
  const completed = fixture([manualSource('COMPLETED')]);
  await setStatus(completed, 'DRAFT', taster);
  const original = structuredClone(completed.rows[0]);
  const updateCount = completed.updates.length;
  const historyCount = completed.history.length;
  await assert.rejects(saveTasting(completed.db, admin, createInput({ id: original.id, version: original.version, date: '2026-11-22' }), manualNow), /historical/);
  assert.deepEqual(completed.rows[0], original);
  assert.equal(completed.updates.length, updateCount);
  assert.equal(completed.history.length, historyCount);
  assert.equal(completed.rows[0].completedVisitId, 'visit-with-photo');
});

test('notes-only edits preserve the manual workflow choice and an identical replay writes no additional history or version', async () => {
  const f = fixture([manualSource('STATE_APPROVED')]);
  const original = structuredClone(f.rows[0]);
  const input = createInput({ id: original.id, version: original.version, tasterNotes: 'Updated setup note.', internalNotes: original.internalNotes });
  const updated = await saveTasting(f.db, admin, input, manualNow);
  assert.equal(updated.workflowStatusOverride, 'STATE_APPROVED');
  assert.equal(updated.tasterNotes, 'Updated setup note.');
  assert.equal(updated.tasterResponse, original.tasterResponse);
  assert.equal(updated.agencyApproval, original.agencyApproval);
  assert.equal(updated.stateApproval, original.stateApproval);
  assert.deepEqual(updated.approvedAssignment, original.approvedAssignment);
  assert.deepEqual(updated.importMetadata, original.importMetadata);
  assert.deepEqual(f.history.map(entry => entry.type), ['DETAILS_UPDATED']);
  const version = updated.version;
  await saveTasting(f.db, admin, { ...input, version }, manualNow);
  assert.equal(f.rows[0].workflowStatusOverride, 'STATE_APPROVED');
  assert.equal(f.rows[0].version, version);
  assert.equal(f.updates.length, 1);
  assert.deepEqual(f.history.map(entry => entry.type), ['DETAILS_UPDATED']);
});
