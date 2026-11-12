import type { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { reconcileSupplyMailboxes, syncSupplyMailbox } from './mail';
import { refreshSupplyShipmentTracking } from './tracking';

type JobServices = { reconcile?: typeof reconcileSupplyMailboxes; mailbox?: typeof syncSupplyMailbox; tracking?: typeof refreshSupplyShipmentTracking; clock?: () => number };

/** Global due queues keep one long import from starving another person or tracking. */
export async function runSupplyJobs(db: PrismaClient = prisma, services: JobServices = {}) {
  const clock = services.clock ?? Date.now, started = clock();
  const reconcile = services.reconcile ?? reconcileSupplyMailboxes;
  const mailbox = services.mailbox ?? syncSupplyMailbox;
  const tracking = services.tracking ?? refreshSupplyShipmentTracking;
  const organizations = await db.organization.findMany({ where: { active: true, accountStatus: { notIn: ['SUSPENDED', 'CANCELLED'] }, features: { some: { featureKey: 'PRODUCTION_SUPPLIES', enabled: true } } }, select: { id: true }, take: 50, orderBy: { id: 'asc' } });
  const result = { organizations: 0, mailboxChecks: 0, mailboxErrors: 0, tracking: [] as Array<{ shipmentId: string; status: string }>, deferred: false };
  // Metadata reconciliation performs no provider calls. Bound it separately from import work.
  for (const organization of organizations) {
    if (clock() - started > 20_000) { result.deferred = true; break; }
    try { await reconcile(organization.id, db); result.organizations++; } catch { result.mailboxErrors++; }
  }
  const ids = organizations.map(organization => organization.id);
  const now = new Date();
  const [dueShipments, dueMailboxes] = await Promise.all([
    db.supplyShipment.findMany({ where: { organizationId: { in: ids }, nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }], take: 2, select: { id: true, organizationId: true } }),
    db.supplyMailboxSync.findMany({ where: { organizationId: { in: ids }, connectionId: { not: null }, status: { notIn: ['PAUSED', 'CONNECTION_REQUIRED', 'PERMISSION_REQUIRED'] }, nextSyncAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: [{ nextSyncAt: 'asc' }, { id: 'asc' }], take: 2, select: { organizationId: true, userId: true } }),
  ]);
  // Start tracking first. Each lookup is bounded to two attempts with an 8s timeout.
  // Mail lanes each checkpoint by 120s and run concurrently, below the route's 300s limit.
  const trackingLane = (async () => {
    for (const shipment of dueShipments) {
      if (clock() - started > 220_000) { result.deferred = true; break; }
      try { const update = await tracking(shipment.organizationId, shipment.id, db, { timeoutMs: 8_000, maxAttempts: 2 }); result.tracking.push({ shipmentId: shipment.id, status: update.status }); }
      catch { result.tracking.push({ shipmentId: shipment.id, status: 'failed' }); }
    }
  })();
  const mailLanes = dueMailboxes.map(async row => {
    if (clock() - started > 100_000) { result.deferred = true; return; }
    try { const update = await mailbox(row.organizationId, row.userId, db, { budgetMs: 120_000 }); result.mailboxChecks++; if ('error' in update) result.mailboxErrors++; }
    catch { result.mailboxErrors++; }
  });
  await Promise.allSettled([trackingLane, ...mailLanes]);
  result.deferred ||= dueShipments.length === 2 || dueMailboxes.length === 2 || organizations.length === 50;
  return result;
}
