import { Prisma, type PrismaClient, type TastingEvent } from '@prisma/client';
import { EASTERN_TIME_ZONE, formatDateInputValue } from '../dateTime';

type TastingDb = PrismaClient | Prisma.TransactionClient;
export type TastingExecutionActor = { organizationId: string; userId: string };
export class TastingExecutionError extends Error {}

export function tastingScheduleFingerprint(event: Pick<TastingEvent, 'agencyId' | 'assignedTasterUserId' | 'scheduledDate' | 'startsAt' | 'endsAt'>) {
  return JSON.stringify([event.agencyId, event.assignedTasterUserId, event.scheduledDate.toISOString().slice(0, 10), event.startsAt.toISOString(), event.endsAt.toISOString()]);
}

/** Read on entry and again under the scheduling lock before persisting evidence. */
export async function requireTastingExecutionContext(db: TastingDb, actor: TastingExecutionActor, tastingId: string, options: { agencyId?: string | null; fingerprint?: string | null; now?: Date; allowCompleted?: boolean } = {}) {
  const [feature, user, organization, event] = await Promise.all([
    db.organizationFeature.findFirst({ where: { organizationId: actor.organizationId, featureKey: 'TASTING_MANAGEMENT', enabled: true }, select: { id: true } }),
    db.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, isActive: true }, select: { id: true } }),
    db.organization.findFirst({ where: { id: actor.organizationId, active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] } }, select: { id: true } }),
    db.tastingEvent.findFirst({ where: { id: tastingId, organizationId: actor.organizationId } }),
  ]);
  if (!feature || !user || !organization || !event || event.assignedTasterUserId !== actor.userId) throw new TastingExecutionError('This tasting is unavailable or is assigned to another taster.');
  if (event.cancelledAt || event.agencyApproval === 'DENIED' || event.stateApproval === 'DENIED') throw new TastingExecutionError('A cancelled or denied tasting cannot be logged.');
  if (event.completedAt && !options.allowCompleted) throw new TastingExecutionError('This tasting already has a completed visit.');
  if (!(event.completedAt && options.allowCompleted) && event.scheduledDate.toISOString().slice(0, 10) !== formatDateInputValue(options.now ?? new Date(), EASTERN_TIME_ZONE)) throw new TastingExecutionError('Log this tasting visit on its scheduled date.');
  if (options.agencyId !== undefined && options.agencyId !== event.agencyId) throw new TastingExecutionError('The tasting and visit must use the same retail account.');
  if (options.fingerprint != null && options.fingerprint !== tastingScheduleFingerprint(event)) throw new TastingExecutionError('The tasting schedule changed. Open the tasting again before logging.');
  return event;
}

/** The caller's transaction holds the same organization lock as rescheduling. */
export async function completeTastingFromVisit(db: Prisma.TransactionClient, actor: TastingExecutionActor, input: { tastingId: string; visitId: string; fingerprint: string; now?: Date }) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tasting:${actor.organizationId}`}, 0))`;
  const event = await requireTastingExecutionContext(db, actor, input.tastingId, { fingerprint: input.fingerprint, now: input.now, allowCompleted: true });
  if (event.completedAt) {
    if (event.completedVisitId === input.visitId) return event;
    throw new Error('This tasting already has a completed visit.');
  }
  const visit = await db.loggedVisit.findFirst({
    where: { id: input.visitId, organizationId: actor.organizationId, tastingEventId: event.id, agencyId: event.agencyId, locationType: 'agency', createdByUserId: event.assignedTasterUserId },
    include: { photos: { where: { organizationId: actor.organizationId, storageKey: { not: null }, contentType: { startsWith: 'image/' }, sizeBytes: { gt: 0 } }, select: { id: true } } },
  });
  if (!visit || !visit.photos.length || formatDateInputValue(visit.visitAt, EASTERN_TIME_ZONE) !== event.scheduledDate.toISOString().slice(0, 10)) throw new Error('A same-day tasting visit with a verified photo is required.');
  const completedAt = input.now ?? new Date();
  const completed = await db.tastingEvent.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: event.id } }, data: { completedAt, completedVisitId: visit.id, version: { increment: 1 } } });
  await db.tastingWorkflowEvent.create({ data: { organizationId: actor.organizationId, tastingEventId: event.id, type: 'TASTING_COMPLETED', actorUserId: actor.userId, newValue: { visitId: visit.id, completedAt: completedAt.toISOString() } } });
  return completed;
}
