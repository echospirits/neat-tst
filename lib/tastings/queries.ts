import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../prisma';
import { isAdminRole } from '../userAccess';
import type { TastingActor } from './service';

const include = { agency: true, assignedTaster: { select: { id: true, name: true, firstName: true, lastName: true, email: true } }, contact: true } satisfies Prisma.TastingEventInclude;

export type TastingListOptions = {
  from?: Date; to?: Date; agencyId?: string; assignedTasterUserId?: string;
  limit?: number; offset?: number; search?: string; view?: 'upcoming' | 'history'; today?: Date; order?: 'asc' | 'desc';
};

export async function listTastings(actor: TastingActor, options: TastingListOptions = {}) {
  const entitled = await prisma.organizationFeature.findFirst({ where: { organizationId: actor.organizationId, featureKey: 'TASTING_MANAGEMENT', enabled: true } });
  if (!entitled) return [];
  const active = { cancelledAt: null, agencyApproval: { not: 'DENIED' }, stateApproval: { not: 'DENIED' } } as const;
  const where: Prisma.TastingEventWhereInput = {
    organizationId: actor.organizationId,
    ...(options.agencyId ? { agencyId: options.agencyId } : {}),
    ...(actor.role === UserRole.TASTER ? { assignedTasterUserId: actor.userId } : options.assignedTasterUserId ? { assignedTasterUserId: options.assignedTasterUserId } : {}),
    ...(options.from || options.to ? { scheduledDate: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lt: options.to } : {}) } } : {}),
    ...(options.search ? { OR: [{ agency: { name: { contains: options.search.slice(0, 120), mode: 'insensitive' } } }, { agency: { agencyId: { contains: options.search.slice(0, 120) } } }] } : {}),
    ...(options.view === 'upcoming' ? { AND: [active, { completedAt: null }, ...(options.today ? [{ scheduledDate: { gte: options.today } }] : [])] } : {}),
    ...(options.view === 'history' ? { AND: [{ OR: [{ completedAt: { not: null } }, { cancelledAt: { not: null } }, { agencyApproval: 'DENIED' }, { stateApproval: 'DENIED' }, ...(options.today ? [{ scheduledDate: { lt: options.today } }] : [])] }] } : {}),
  };
  const rows = await prisma.tastingEvent.findMany({ where, include, orderBy: [{ scheduledDate: options.order ?? (options.view === 'history' ? 'desc' : 'asc') }, { startsAt: options.order ?? 'asc' }, { id: 'asc' }], take: Math.min(250, Math.max(1, options.limit ?? 100)), skip: Math.min(50000, Math.max(0, options.offset ?? 0)) });
  return rows.map(row => ({ ...row, internalNotes: isAdminRole(actor.role) ? row.internalNotes : null, importMetadata: isAdminRole(actor.role) ? row.importMetadata : null }));
}

export async function getTasting(actor: TastingActor, id: string) {
  if (!(await prisma.organizationFeature.findFirst({ where: { organizationId: actor.organizationId, featureKey: 'TASTING_MANAGEMENT', enabled: true } }))) return null;
  const row = await prisma.tastingEvent.findFirst({ where: { id, organizationId: actor.organizationId, ...(actor.role === UserRole.TASTER ? { assignedTasterUserId: actor.userId } : {}) }, include: { ...include, history: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }, completedVisit: { include: { photos: true } }, visits: { orderBy: { visitAt: 'desc' }, take: 5, include: { photos: true } } } });
  if (!row) return null;
  return { ...row, internalNotes: isAdminRole(actor.role) ? row.internalNotes : null, importMetadata: isAdminRole(actor.role) ? row.importMetadata : null,
    history: row.history.map(entry => isAdminRole(actor.role) ? entry : { ...entry, oldValue: null, newValue: null, comment: ['TASTER_NEEDS_EDIT', 'CANCELLED'].includes(entry.type) ? entry.comment : null }) };
}

export async function tastingEditorOptions(actor: TastingActor) {
  if (!isAdminRole(actor.role)) throw new Error('Administrator access required.');
  return prisma.user.findMany({ where: { organizationId: actor.organizationId, isActive: true }, select: { id: true, name: true, firstName: true, lastName: true, email: true }, orderBy: { name: 'asc' } });
}
