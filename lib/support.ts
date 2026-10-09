import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { getCurrentSession } from './auth';
import { isSideEffectEnabled } from './appEnvironment';
import { requireOrganizationContext } from './organizations';
import { prisma } from './prisma';
import { createSupportSchema, sanitizeSupportDiagnostics, supportReplySchema, SUPPORT_PAGE_SIZE, validateSupportScreenshot } from './supportShared';

export class SupportError extends Error {
  constructor(message: string, public status = 400, public fields?: Record<string, string>) { super(message); }
}

export async function getSupportActor() {
  const session = await getCurrentSession();
  if (!session?.user.isActive) throw new SupportError('Sign in to use Support.', 401);
  return session.user;
}

type Actor = Awaited<ReturnType<typeof getSupportActor>>;
type SupportDb = Pick<Prisma.TransactionClient, 'user' | 'supportTicket' | 'supportMessage' | 'supportScreenshot' | '$queryRaw'>;

function scopeFor(actor: Actor, mine = false): Prisma.SupportTicketWhereInput {
  if (actor.role === UserRole.PLATFORM_ADMIN) return mine ? { reporterId: actor.id } : {};
  if (!actor.organizationId) return { id: { in: [] } };
  return { organizationId: actor.organizationId, ...((actor.role !== UserRole.ADMIN || mine) ? { reporterId: actor.id } : {}) };
}

function canReply(actor: Actor, ticket: { reporterId: string }) {
  return actor.role === UserRole.PLATFORM_ADMIN || actor.id === ticket.reporterId;
}

async function currentActor(tx: SupportDb, previous: Actor) {
  // Serialize writes by actor: retries and rate limits stay correct under concurrent requests.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${previous.id} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: previous.id } });
  if (!actor?.isActive || actor.role !== previous.role || actor.organizationId !== previous.organizationId) throw new SupportError('Your access changed. Reload Support and try again.', 403);
  return actor;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.'), issue.message]));
    throw new SupportError('Check the highlighted fields.', 400, fields);
  }
  return result.data;
}

const personSelect = { id: true, firstName: true, lastName: true, name: true, email: true } as const;

export async function listSupportTickets(options: { q?: string; status?: string; category?: string; mine?: boolean; page?: number } = {}) {
  const actor = await getSupportActor();
  const q = (options.q ?? '').trim().slice(0, 160);
  const category = z.enum(['BUG', 'DATA', 'ENHANCEMENT', 'QUESTION']).safeParse(options.category);
  const status = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'PLANNED', 'COMPLETE']).safeParse(options.status);
  const number = /^#?\d+$/.test(q) && Number(q.replace('#', '')) <= 2147483647 ? Number(q.replace('#', '')) : null;
  const where: Prisma.SupportTicketWhereInput = {
    ...scopeFor(actor, options.mine),
    ...(category.success ? { category: category.data } : {}),
    ...(status.success ? { status: status.data } : options.status === 'all' ? {} : { status: { not: 'COMPLETE' } }),
    ...(q ? { OR: [
      { title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } },
      ...(number !== null ? [{ number }] : []),
      ...(actor.role === UserRole.PLATFORM_ADMIN ? [{ organization: { displayName: { contains: q, mode: 'insensitive' as const } } }] : []),
      { reporter: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } },
    ] } : {}),
  };
  const page = Math.min(10000, Math.max(1, Math.floor(options.page || 1)));
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({ where, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * SUPPORT_PAGE_SIZE, take: SUPPORT_PAGE_SIZE,
      select: { id: true, number: true, title: true, category: true, status: true, priority: true, createdAt: true, updatedAt: true, anticipatedFixDate: true, organization: { select: { displayName: true } }, reporter: { select: personSelect } } }),
    prisma.supportTicket.count({ where }),
  ]);
  return { actor, tickets, total, page };
}

export async function getSupportTicket(id: string) {
  const actor = await getSupportActor();
  const ticket = await prisma.supportTicket.findFirst({ where: { id, ...scopeFor(actor) }, include: {
    organization: { select: { displayName: true } }, reporter: { select: personSelect },
    screenshot: { select: { ticketId: true } },
    messages: { where: actor.role === UserRole.PLATFORM_ADMIN ? {} : { isInternal: false }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { author: { select: personSelect } } },
  } });
  if (!ticket) throw new SupportError('This ticket is unavailable.', 404);
  return { actor, ticket, canReply: canReply(actor, ticket) };
}

export async function createSupportTicket(input: unknown, diagnostics: unknown, screenshot?: { bytes: Uint8Array; contentType: string }) {
  const previous = await getSupportActor();
  const data = parse(createSupportSchema, input);
  if (screenshot && (!isSideEffectEnabled('fileUploads') || !validateSupportScreenshot(screenshot.bytes, screenshot.contentType))) throw new SupportError('The screenshot could not be accepted. Remove it or choose a smaller PNG, JPEG or WebP image.');
  const organizationId = previous.role === UserRole.PLATFORM_ADMIN
    ? (await requireOrganizationContext(previous)).organizationId : previous.organizationId;
  if (!organizationId) throw new SupportError('Your account needs an organization before reporting a ticket.', 403);
  return prisma.$transaction(async tx => {
    const actor = await currentActor(tx, previous);
    const duplicate = await tx.supportTicket.findUnique({ where: { requestId: data.requestId } });
    if (duplicate) {
      if (duplicate.reporterId !== actor.id || duplicate.organizationId !== organizationId) throw new SupportError('This request could not be accepted.', 409);
      return { id: duplicate.id, number: duplicate.number };
    }
    const count = await tx.supportTicket.count({ where: { reporterId: actor.id, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } } });
    if (count >= 10) throw new SupportError('You have sent several reports recently. Add a reply to an existing ticket, or try again in an hour.', 429);
    return tx.supportTicket.create({ data: { ...data, reporterId: actor.id, organizationId,
      diagnostics: sanitizeSupportDiagnostics(diagnostics) as Prisma.InputJsonValue,
      ...(screenshot ? { screenshot: { create: { bytes: new Uint8Array(screenshot.bytes), contentType: screenshot.contentType } } } : {}),
    }, select: { id: true, number: true } });
  });
}

export async function replyToSupportTicket(id: string, input: unknown) {
  const previous = await getSupportActor();
  const data = parse(supportReplySchema, input);
  const platform = previous.role === UserRole.PLATFORM_ADMIN;
  if (!platform && (data.action !== 'reply' || data.status !== undefined || data.anticipatedFixDate !== undefined || data.priority !== undefined)) throw new SupportError('Only Platform Admin can update support status or add private notes.', 403);
  return prisma.$transaction(async tx => {
    const actor = await currentActor(tx, previous);
    const ticket = await tx.supportTicket.findFirst({ where: { id, ...scopeFor(actor) } });
    if (!ticket) throw new SupportError('This ticket is unavailable.', 404);
    if (!canReply(actor, ticket)) throw new SupportError('Only the reporter and Platform Admin can reply to this ticket.', 403);
    const duplicate = await tx.supportMessage.findUnique({ where: { requestId: data.requestId } });
    if (duplicate) {
      if (duplicate.authorId !== actor.id || duplicate.ticketId !== id) throw new SupportError('This reply could not be accepted.', 409);
      return { id };
    }
    const internal = data.action === 'note';
    const status = internal ? ticket.status : platform ? data.status ?? ticket.status
      : ['COMPLETE', 'WAITING_ON_USER'].includes(ticket.status) ? 'OPEN' : ticket.status;
    const anticipatedFixDate = !internal && platform && data.anticipatedFixDate !== undefined
      ? data.anticipatedFixDate ? new Date(`${data.anticipatedFixDate}T00:00:00Z`) : null : ticket.anticipatedFixDate;
    if (!internal && platform && status === 'PLANNED' && !anticipatedFixDate) throw new SupportError('Add an anticipated fix date for a planned fix.', 400, { anticipatedFixDate: 'Add an anticipated fix date.' });
    const saved = await tx.supportTicket.updateMany({ where: { id, version: data.version }, data: {
      version: { increment: 1 },
      ...(!internal ? { status, anticipatedFixDate, ...(platform ? { priority: data.priority ?? ticket.priority, responseVersion: { increment: 1 } } : {}) } : {}),
    } });
    if (!saved.count) throw new SupportError('This ticket changed while you were working. Reload the ticket, then send your saved text.', 409);
    await tx.supportMessage.create({ data: { requestId: data.requestId, ticketId: id, authorId: actor.id, body: data.body,
      isInternal: internal, isPlatformReply: platform && !internal,
      ...(!internal ? { status, anticipatedFixDate } : {}),
    } });
    return { id };
  });
}

export async function acknowledgeSupportUpdate(id: string, version: unknown) {
  const previous = await getSupportActor();
  const readVersion = z.number().int().positive().safeParse(version);
  if (!readVersion.success) throw new SupportError('Invalid support update.');
  await prisma.$transaction(async tx => {
    const actor = await currentActor(tx, previous);
    // An old banner can acknowledge only its own revision, never a newer reply.
    await tx.supportTicket.updateMany({ where: { id, ...scopeFor(actor, true), reporterId: actor.id,
      responseVersion: { gte: readVersion.data }, reporterReadVersion: { lt: readVersion.data } }, data: { reporterReadVersion: readVersion.data } });
  });
}

export async function getUnreadSupportUpdates() {
  const actor = await getSupportActor();
  const updates = await prisma.supportTicket.findMany({ where: { ...scopeFor(actor, true), reporterId: actor.id,
    responseVersion: { gt: prisma.supportTicket.fields.reporterReadVersion } }, take: 3, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: { id: true, number: true, title: true, description: true, status: true, responseVersion: true, anticipatedFixDate: true,
      messages: { where: { isPlatformReply: true, isInternal: false }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { body: true, status: true, anticipatedFixDate: true } } },
  });
  // Show the answer as sent, even if the reporter has since reopened the ticket.
  return updates.map(ticket => ({ ...ticket, status: ticket.messages[0]?.status ?? ticket.status,
    anticipatedFixDate: ticket.messages[0] ? ticket.messages[0].anticipatedFixDate : ticket.anticipatedFixDate }));
}

export async function getSupportScreenshot(id: string) {
  const actor = await getSupportActor();
  const screenshot = await prisma.supportScreenshot.findFirst({ where: { ticketId: id, ticket: scopeFor(actor) } });
  if (!screenshot) throw new SupportError('This screenshot is unavailable.', 404);
  return screenshot;
}

export async function removeSupportScreenshot(id: string) {
  const previous = await getSupportActor();
  await prisma.$transaction(async tx => {
    const actor = await currentActor(tx, previous);
    const ticket = await tx.supportTicket.findFirst({ where: { id, ...scopeFor(actor) } });
    if (!ticket) throw new SupportError('This ticket is unavailable.', 404);
    if (!canReply(actor, ticket)) throw new SupportError('Only the reporter and Platform Admin can remove this screenshot.', 403);
    await tx.supportScreenshot.deleteMany({ where: { ticketId: id } });
  });
}

export async function getPlatformSupportCounts() {
  const actor = await getSupportActor();
  if (actor.role !== UserRole.PLATFORM_ADMIN) throw new SupportError('Platform Admin access is required.', 403);
  const [active, urgent] = await Promise.all([
    prisma.supportTicket.count({ where: { status: { not: 'COMPLETE' } } }),
    prisma.supportTicket.count({ where: { status: { not: 'COMPLETE' }, priority: 'URGENT' } }),
  ]);
  return { active, urgent };
}
