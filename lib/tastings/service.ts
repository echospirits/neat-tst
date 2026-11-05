import { Prisma, type TastingEvent, type UserRole } from '@prisma/client';
import { z } from 'zod';
import { isAdminRole } from '../userAccess';
import { isTerminalTasting, tastingConflicts, tastingMinimumDays } from './model';
import { parseTastingSchedule, tastingScheduleLabel } from './time';

export type TastingDb = Prisma.TransactionClient;
export type TastingActor = { organizationId: string; userId: string; role: UserRole };
export class TastingError extends Error {}
const optionalId = z.string().trim().max(100).optional().transform(value => value || null);
export const tastingInput = z.object({
  id: z.string().min(1).max(100).optional(), version: z.coerce.number().int().nonnegative().default(0),
  submissionKey: z.string().min(1).max(100).optional(), agencyId: z.string().min(1).max(100),
  assignedTasterUserId: z.string().min(1).max(100), contactId: optionalId,
  date: z.string(), startTime: z.string(), endTime: z.string(),
  tasterNotes: z.string().trim().max(6000).default(''), internalNotes: z.string().trim().max(6000).default(''),
  spacingOverrideReason: z.string().trim().max(2000).default(''),
});
export const TASTING_ACTIONS = ['TASTER_APPROVE', 'TASTER_NEEDS_EDIT', 'REQUEST_AGENCY_APPROVAL', 'AGENCY_APPROVE', 'AGENCY_DENY', 'SUBMIT_TO_STATE', 'STATE_APPROVE', 'STATE_DENY', 'CANCEL', 'SAVE_FEEDBACK'] as const;
export type TastingAction = typeof TASTING_ACTIONS[number];
export const tastingTransitionInput = z.object({
  id: z.string().min(1).max(100), version: z.coerce.number().int().positive(), action: z.enum(TASTING_ACTIONS),
  comment: z.string().trim().max(6000).default(''), contactId: optionalId,
  stateReference: z.string().trim().max(200).optional(),
  emailsGathered: z.preprocess(value => value === '' || value === null ? null : Number(value), z.number().int().min(0).max(100000).nullable()).optional(),
  postEventNotes: z.string().trim().max(6000).optional(), tasterFeedback: z.string().trim().max(6000).optional(),
});

/** Mutation callers must provide a transaction so scheduling checks and writes share this lock. */
export async function lockTastings(db: TastingDb, organizationId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tasting:${organizationId}`},0))`;
}

export async function assertTastingActor(db: TastingDb, actor: TastingActor, administrator = false) {
  const [user, feature, organization] = await Promise.all([
    db.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, isActive: true }, select: { id: true, role: true } }),
    db.organizationFeature.findFirst({ where: { organizationId: actor.organizationId, featureKey: 'TASTING_MANAGEMENT', enabled: true }, select: { id: true } }),
    db.organization.findFirst({ where: { id: actor.organizationId, active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] } }, select: { id: true, settings: true } }),
  ]);
  if (!user || user.role !== actor.role || !feature || !organization) throw new TastingError('Tasting Management is unavailable.');
  if (administrator && !isAdminRole(user.role)) throw new TastingError('Administrator access is required.');
  return { user, organization };
}

export function tastingAssignment(value: Pick<TastingEvent, 'agencyId' | 'scheduledDate' | 'startsAt' | 'endsAt' | 'assignedTasterUserId'>) {
  return { agencyId: value.agencyId, date: value.scheduledDate.toISOString().slice(0, 10), startsAt: value.startsAt.toISOString(), endsAt: value.endsAt.toISOString(), assignedTasterUserId: value.assignedTasterUserId };
}
export async function writeTastingHistory(db: TastingDb, actor: TastingActor, tastingEventId: string, type: string, oldValue: Prisma.InputJsonValue | null, newValue: Prisma.InputJsonValue | null, comment?: string, now = new Date()) {
  return db.tastingWorkflowEvent.create({ data: { organizationId: actor.organizationId, tastingEventId, actorUserId: actor.userId, type, oldValue: oldValue ?? Prisma.DbNull, newValue: newValue ?? Prisma.DbNull, comment: comment || null, createdAt: now } });
}

export async function assertTastingReferences(db: TastingDb, actor: TastingActor, agencyId: string, userId: string | null, contactId: string | null) {
  const agency = await db.agency.findFirst({ where: { id: agencyId, state: 'OH' }, select: { id: true, agencyId: true } });
  if (!agency) throw new TastingError('Choose an Ohio Retail account.');
  const [user, contact] = await Promise.all([
    userId ? db.user.findFirst({ where: { id: userId, organizationId: actor.organizationId, isActive: true, role: { not: 'PLATFORM_ADMIN' } }, select: { id: true } }) : null,
    contactId ? db.locationContact.findFirst({ where: { id: contactId, organizationId: actor.organizationId, OR: [{ agencyId }, { agencyId: agency.agencyId }], active: true, mergedIntoContactId: null }, select: { id: true } }) : null,
  ]);
  if (userId && !user) throw new TastingError('Choose an active taster in this organization.');
  if (contactId && !contact) throw new TastingError('Choose an active contact from this Retail account.');
}

export async function assertTastingSchedule(db: TastingDb, actor: TastingActor, proposal: Pick<TastingEvent, 'agencyId' | 'assignedTasterUserId' | 'scheduledDate' | 'startsAt' | 'endsAt'> & { id?: string }, minimumDays: number, overrideReason = '') {
  const candidates = await db.tastingEvent.findMany({ where: { organizationId: actor.organizationId, id: proposal.id ? { not: proposal.id } : undefined, cancelledAt: null, completedAt: null, agencyApproval: { not: 'DENIED' }, stateApproval: { not: 'DENIED' }, OR: [{ agencyId: proposal.agencyId, scheduledDate: { gt: new Date(proposal.scheduledDate.getTime() - minimumDays * 86_400_000), lt: new Date(proposal.scheduledDate.getTime() + minimumDays * 86_400_000) } }, ...(proposal.assignedTasterUserId ? [{ assignedTasterUserId: proposal.assignedTasterUserId, startsAt: { lt: proposal.endsAt }, endsAt: { gt: proposal.startsAt } }] : [])] }, include: { assignedTaster: { select: { name: true, email: true } } } });
  const conflicts = tastingConflicts(proposal, candidates, minimumDays);
  const overlappingEvent = proposal.assignedTasterUserId ? await db.eventShift.findFirst({ where: { organizationId: actor.organizationId, status: { in: ['open', 'confirmed'] }, OR: [{ staffUserIds: { has: proposal.assignedTasterUserId } }, { assignedUserId: proposal.assignedTasterUserId }], startsAt: { lt: proposal.endsAt }, endsAt: { gt: proposal.startsAt } }, select: { id: true, title: true } }) : null;
  if (conflicts.overlap.length || overlappingEvent) {
    const event = conflicts.overlap[0];
    throw new TastingError(event ? `Taster is already assigned to ${tastingScheduleLabel(event)}. Choose another time or taster.` : `Taster already has an overlapping event: ${overlappingEvent?.title}. Choose another time or taster.`);
  }
  if (conflicts.spacing.length && (!isAdminRole(actor.role) || !overrideReason.trim())) {
    const conflict = candidates.find(value => value.id === conflicts.spacing[0].id)!;
    throw new TastingError(`This Retail account has a tasting ${tastingScheduleLabel(conflict)} with ${conflict.assignedTaster?.name || conflict.assignedTaster?.email || 'an unassigned taster'}. Allow ${minimumDays} days between tastings, or enter an administrator override reason.`);
  }
  return conflicts.spacing;
}

export async function saveTasting(db: TastingDb, actor: TastingActor, raw: unknown, now = new Date()) {
  const { organization } = await assertTastingActor(db, actor, true);
  const input = tastingInput.parse(raw);
  let schedule: ReturnType<typeof parseTastingSchedule>;
  try { schedule = parseTastingSchedule(input.date, input.startTime, input.endTime); } catch (error) { throw new TastingError(error instanceof Error ? error.message : 'Invalid schedule.'); }
  await lockTastings(db, actor.organizationId);
  const old = input.id ? await db.tastingEvent.findFirst({ where: { id: input.id, organizationId: actor.organizationId } }) : input.submissionKey ? await db.tastingEvent.findUnique({ where: { organizationId_submissionKey: { organizationId: actor.organizationId, submissionKey: input.submissionKey } } }) : null;
  if (!input.id && old) return old;
  if (input.id && (!old || old.version !== input.version)) throw new TastingError('This tasting changed. Reload before saving.');
  if (old && isTerminalTasting(old)) throw new TastingError('This tasting is historical. Create a new proposal instead of changing its schedule.');
  await assertTastingReferences(db, actor, input.agencyId, input.assignedTasterUserId, input.contactId);
  const data = { agencyId: input.agencyId, assignedTasterUserId: input.assignedTasterUserId, contactId: input.contactId, ...schedule, tasterNotes: input.tasterNotes, internalNotes: input.internalNotes };
  const changed = old ? Object.entries(data).some(([key, value]) => {
    const before = old[key as keyof typeof old];
    return value instanceof Date && before instanceof Date ? value.getTime() !== before.getTime() : value !== before;
  }) : true;
  if (!changed) return old!;
  const assignmentChanged = !old || old.assignedTasterUserId !== data.assignedTasterUserId;
  const timeChanged = !old || old.startsAt.getTime() !== data.startsAt.getTime() || old.endsAt.getTime() !== data.endsAt.getTime();
  const agencyChanged = !old || old.agencyId !== data.agencyId;
  const spacing = assignmentChanged || timeChanged || agencyChanged ? await assertTastingSchedule(db, actor, { ...data, id: old?.id }, tastingMinimumDays(organization.settings), input.spacingOverrideReason) : [];
  const reset: Prisma.TastingEventUncheckedUpdateInput = {};
  if (old && (assignmentChanged || timeChanged || agencyChanged)) Object.assign(reset, { tasterResponse: 'PENDING', tasterRespondedAt: null, tasterRespondedByUserId: null, tasterResponseComment: null, approvedAssignment: Prisma.DbNull });
  if (old && (timeChanged || agencyChanged)) Object.assign(reset, { agencyApproval: 'NOT_REQUESTED', agencyRequestedAt: null, agencyRequestedByUserId: null, agencyDecidedAt: null, agencyDecidedByUserId: null, agencyDecisionComment: null, stateApproval: 'NOT_SUBMITTED', stateSubmittedAt: null, stateSubmittedByUserId: null, stateDecidedAt: null, stateDecidedByUserId: null, stateDecisionComment: null, stateReference: null });
  if (old && (agencyChanged || old.scheduledDate.getTime() !== schedule.scheduledDate.getTime())) Object.assign(reset, { retailBottlesSold: null, salesProductBreakdown: Prisma.DbNull, salesDataSource: null, salesCalculatedAt: null, salesSourceDataThrough: null, salesSourceRevision: null });
  const event = old ? await db.tastingEvent.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: old.id } }, data: { ...data, ...reset, importNeedsReview: false, version: { increment: 1 } } }) : await db.tastingEvent.create({ data: { ...data, organizationId: actor.organizationId, createdByUserId: actor.userId, submissionKey: input.submissionKey, createdAt: now } });
  if (!old) await writeTastingHistory(db, actor, event.id, 'DRAFT_CREATED', null, tastingAssignment(event), undefined, now);
  else {
    if (timeChanged) await writeTastingHistory(db, actor, event.id, 'DATE_TIME_CHANGED', tastingAssignment(old), tastingAssignment(event), undefined, now);
    if (agencyChanged) await writeTastingHistory(db, actor, event.id, 'AGENCY_CHANGED', { agencyId: old.agencyId }, { agencyId: event.agencyId }, undefined, now);
    if (assignmentChanged) await writeTastingHistory(db, actor, event.id, 'TASTER_REASSIGNED', { userId: old.assignedTasterUserId }, { userId: event.assignedTasterUserId }, undefined, now);
    if ((assignmentChanged || timeChanged || agencyChanged) && (old.tasterResponse !== event.tasterResponse || old.agencyApproval !== event.agencyApproval || old.stateApproval !== event.stateApproval || old.approvedAssignment !== null && event.approvedAssignment === null)) await writeTastingHistory(db, actor, event.id, 'APPROVALS_RESET', { tasterResponse: old.tasterResponse, agencyApproval: old.agencyApproval, stateApproval: old.stateApproval }, { tasterResponse: event.tasterResponse, agencyApproval: event.agencyApproval, stateApproval: event.stateApproval }, 'Assignment changed; previous approval evidence remains in history.', now);
    if (!assignmentChanged && !timeChanged && !agencyChanged) await writeTastingHistory(db, actor, event.id, 'DETAILS_UPDATED', { contactId: old.contactId, tasterNotes: old.tasterNotes, internalNotes: old.internalNotes }, { contactId: event.contactId, tasterNotes: event.tasterNotes, internalNotes: event.internalNotes }, undefined, now);
  }
  if (spacing.length) await writeTastingHistory(db, actor, event.id, 'SPACING_OVERRIDE', null, { conflictingTastingIds: spacing.map(value => value.id), minimumDays: tastingMinimumDays(organization.settings) }, input.spacingOverrideReason, now);
  return event;
}

export async function transitionTasting(db: TastingDb, actor: TastingActor, raw: unknown, now = new Date()) {
  await assertTastingActor(db, actor);
  const input = tastingTransitionInput.parse(raw);
  await lockTastings(db, actor.organizationId);
  const event = await db.tastingEvent.findFirst({ where: { id: input.id, organizationId: actor.organizationId } });
  if (!event || event.version !== input.version) throw new TastingError('This tasting changed or is unavailable. Reload before saving.');
  const tasterAction = input.action === 'TASTER_APPROVE' || input.action === 'TASTER_NEEDS_EDIT';
  const assigned = event.assignedTasterUserId === actor.userId;
  if (tasterAction && !assigned) throw new TastingError('Only the assigned taster can respond to this proposal.');
  if (!tasterAction && input.action !== 'SAVE_FEEDBACK' && !isAdminRole(actor.role)) throw new TastingError('Administrator access is required.');
  if (input.action === 'SAVE_FEEDBACK' && !assigned && !isAdminRole(actor.role)) throw new TastingError('Only the assigned taster or an administrator can record feedback.');
  if (input.action !== 'SAVE_FEEDBACK' && isTerminalTasting(event)) throw new TastingError('This tasting is historical. Its workflow cannot be changed.');
  const data: Prisma.TastingEventUncheckedUpdateInput = {};
  let type: string = input.action;
  if (tasterAction) {
    if (input.action === 'TASTER_NEEDS_EDIT' && !input.comment) throw new TastingError('What needs to change? Add an explanation.');
    const response = input.action === 'TASTER_APPROVE' ? 'APPROVED' : 'NEEDS_EDIT';
    if (event.tasterResponse === response && (event.tasterResponseComment || '') === input.comment) return event;
    Object.assign(data, { tasterResponse: response, tasterResponseComment: input.comment || null, tasterRespondedAt: now, tasterRespondedByUserId: actor.userId, approvedAssignment: response === 'APPROVED' ? tastingAssignment(event) : Prisma.DbNull });
    if (response === 'NEEDS_EDIT') Object.assign(data, { agencyApproval: 'NOT_REQUESTED', agencyRequestedAt: null, agencyRequestedByUserId: null, agencyDecidedAt: null, agencyDecidedByUserId: null, agencyDecisionComment: null, stateApproval: 'NOT_SUBMITTED', stateSubmittedAt: null, stateSubmittedByUserId: null, stateDecidedAt: null, stateDecidedByUserId: null, stateDecisionComment: null, stateReference: null });
    type = response === 'APPROVED' ? 'TASTER_APPROVED' : 'TASTER_NEEDS_EDIT';
  } else if (input.action === 'REQUEST_AGENCY_APPROVAL') {
    if (event.agencyApproval === 'REQUESTED') return event;
    if (event.tasterResponse !== 'APPROVED' || event.agencyApproval !== 'NOT_REQUESTED') throw new TastingError('Obtain the taster response before requesting Agency approval.');
    Object.assign(data, { agencyApproval: 'REQUESTED', agencyRequestedAt: now, agencyRequestedByUserId: actor.userId });
    type = 'AGENCY_APPROVAL_REQUESTED';
  } else if (input.action === 'AGENCY_APPROVE' || input.action === 'AGENCY_DENY') {
    const approval = input.action === 'AGENCY_APPROVE' ? 'APPROVED' : 'DENIED';
    if (event.agencyApproval === approval) return event;
    if (event.agencyApproval !== 'REQUESTED') throw new TastingError('Request Agency approval before recording its decision.');
    Object.assign(data, { agencyApproval: approval, agencyDecidedAt: now, agencyDecidedByUserId: actor.userId, agencyDecisionComment: input.comment || null });
    type = approval === 'APPROVED' ? 'AGENCY_APPROVED' : 'AGENCY_DENIED';
  } else if (input.action === 'SUBMIT_TO_STATE') {
    if (event.stateApproval === 'SUBMITTED') return event;
    if (event.agencyApproval !== 'APPROVED' || event.tasterResponse !== 'APPROVED' || event.stateApproval !== 'NOT_SUBMITTED') throw new TastingError('Obtain taster and Agency approval before submitting to the state.');
    Object.assign(data, { stateApproval: 'SUBMITTED', stateSubmittedAt: now, stateSubmittedByUserId: actor.userId });
    type = 'SUBMITTED_TO_STATE';
  } else if (input.action === 'STATE_APPROVE' || input.action === 'STATE_DENY') {
    const approval = input.action === 'STATE_APPROVE' ? 'APPROVED' : 'DENIED';
    if (event.stateApproval === approval) return event;
    if (event.stateApproval !== 'SUBMITTED') throw new TastingError('Record state submission before its decision.');
    Object.assign(data, { stateApproval: approval, stateDecidedAt: now, stateDecidedByUserId: actor.userId, stateDecisionComment: input.comment || null, stateReference: input.stateReference || null });
    type = approval === 'APPROVED' ? 'STATE_APPROVED' : 'STATE_DENIED';
  } else if (input.action === 'CANCEL') {
    if (!input.comment) throw new TastingError('Add a cancellation reason.');
    Object.assign(data, { cancelledAt: now, cancelledByUserId: actor.userId, cancellationReason: input.comment });
    type = 'CANCELLED';
  } else {
    Object.assign(data, { emailsGathered: input.emailsGathered === undefined ? event.emailsGathered : input.emailsGathered, postEventNotes: input.postEventNotes ?? event.postEventNotes, tasterFeedback: input.tasterFeedback ?? event.tasterFeedback });
    if (event.emailsGathered === data.emailsGathered && event.postEventNotes === data.postEventNotes && event.tasterFeedback === data.tasterFeedback) return event;
    type = 'FEEDBACK_UPDATED';
  }
  if (input.contactId && ['REQUEST_AGENCY_APPROVAL', 'AGENCY_APPROVE', 'AGENCY_DENY'].includes(input.action)) {
    await assertTastingReferences(db, actor, event.agencyId, event.assignedTasterUserId, input.contactId);
    data.contactId = input.contactId;
  }
  const updated = await db.tastingEvent.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: event.id } }, data: { ...data, version: { increment: 1 } } });
  const snapshot = (value: TastingEvent) => ({ tasterResponse: value.tasterResponse, agencyApproval: value.agencyApproval, stateApproval: value.stateApproval, cancelledAt: value.cancelledAt?.toISOString() ?? null, assignedTasterUserId: value.assignedTasterUserId, assignment: tastingAssignment(value), contactId: value.contactId, ...(input.action === 'SAVE_FEEDBACK' ? { emailsGathered: value.emailsGathered, postEventNotes: value.postEventNotes, tasterFeedback: value.tasterFeedback } : {}) });
  await writeTastingHistory(db, actor, event.id, type, snapshot(event), snapshot(updated), input.comment, now);
  if (input.action === 'TASTER_NEEDS_EDIT' && (event.agencyApproval !== 'NOT_REQUESTED' || event.stateApproval !== 'NOT_SUBMITTED')) await writeTastingHistory(db, actor, event.id, 'APPROVALS_RESET', { agencyApproval: event.agencyApproval, stateApproval: event.stateApproval }, { agencyApproval: updated.agencyApproval, stateApproval: updated.stateApproval }, 'Taster requested changes; renewed Agency and state review is required.', now);
  return updated;
}
