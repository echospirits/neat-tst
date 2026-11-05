import { Prisma, type PrismaClient } from '@prisma/client';
import { retainedDays } from '../analytics/ohio';

const SALES_SOURCE = 'OHLQ daily Agency retail sales';

/** Persist an observed same-day association, never a claim of tasting attribution. */
export async function refreshTastingSales(db: PrismaClient, organizationId: string, tastingId: string) {
  for (let attempt = 0; ; attempt++) {
    try { return await calculateTastingSales(db, organizationId, tastingId); }
    catch (error) {
      // A reschedule or import refresh can commit while this read waits for its lock.
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
    }
  }
}

async function calculateTastingSales(db: PrismaClient, organizationId: string, tastingId: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tasting:${organizationId}`}, 0))`;
    const [feature, event] = await Promise.all([
      tx.organizationFeature.findFirst({ where: { organizationId, featureKey: 'TASTING_MANAGEMENT', enabled: true }, select: { id: true } }),
      tx.tastingEvent.findFirst({ where: { id: tastingId, organizationId } }),
    ]);
    if (!feature || !event) return { available: false, updated: false };
    const [agency, products, report] = await Promise.all([
      tx.agency.findUnique({ where: { id: event.agencyId }, select: { agencyId: true, state: true } }),
      tx.organizationProduct.findMany({ where: { organizationId, market: 'OH', status: { in: ['OWNED', 'REPRESENTED'] } }, select: { externalItemCode: true } }),
      tx.ohlqReportImportStatus.findUnique({ where: { dataSource_reportDate: { dataSource: 'ANNUAL_SALES_SUMMARY', reportDate: event.scheduledDate } }, select: { status: true, updatedAt: true } }),
    ]);
    const itemCodes = [...new Set(products.map(product => product.externalItemCode.trim().toUpperCase()).filter(Boolean))].sort();
    const day = event.scheduledDate.toISOString().slice(0, 10);
    if (agency?.state !== 'OH' || !itemCodes.length || report?.status !== 'COMPLETED' || !(await retainedDays(tx, 'retail', day, day)).includes(day)) {
      // Retention does not erase a previously calculated historical observation.
      return { available: false, updated: false, retained: event.retailBottlesSold !== null };
    }
    const revision = `${report.updatedAt.toISOString()}:${itemCodes.join(',')}`;
    if (event.salesSourceRevision === revision && event.salesDataSource === SALES_SOURCE) return { available: true, updated: false };
    const rows = await tx.ohlqAnnualSalesRow.groupBy({ by: ['brand'], where: { agencyId: agency.agencyId, brand: { in: itemCodes }, reportDate: event.scheduledDate }, _sum: { retailBottlesSold: true } });
    const totals = new Map(rows.map(row => [row.brand, row._sum.retailBottlesSold ?? 0]));
    const breakdown = itemCodes.map(itemCode => ({ itemCode, retailBottlesSold: totals.get(itemCode) ?? 0 }));
    const total = breakdown.reduce((sum, row) => sum + row.retailBottlesSold, 0);
    const changed = total !== event.retailBottlesSold || JSON.stringify(breakdown) !== JSON.stringify(event.salesProductBreakdown) || event.salesDataSource !== SALES_SOURCE;
    await tx.tastingEvent.update({ where: { organizationId_id: { organizationId, id: event.id } }, data: { retailBottlesSold: total, salesProductBreakdown: breakdown, salesDataSource: SALES_SOURCE, salesCalculatedAt: new Date(), salesSourceDataThrough: event.scheduledDate, salesSourceRevision: revision } });
    if (changed) await tx.tastingWorkflowEvent.create({ data: { organizationId, tastingEventId: event.id, type: 'SALES_OUTCOME_UPDATED', oldValue: { retailBottlesSold: event.retailBottlesSold, source: event.salesDataSource }, newValue: { retailBottlesSold: total, products: breakdown, source: SALES_SOURCE, sourceDataThrough: day } } });
    return { available: true, updated: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 });
}

/** Called after a completed retail import, including corrected/repeated imports. */
export async function refreshTastingSalesForDate(db: PrismaClient, reportDate: Date) {
  let cursor: string | undefined;
  let updated = 0;
  do {
    const events = await db.tastingEvent.findMany({ where: { scheduledDate: reportDate, organization: { features: { some: { featureKey: 'TASTING_MANAGEMENT', enabled: true } } }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true, organizationId: true }, orderBy: { id: 'asc' }, take: 100 });
    for (const event of events) {
      if ((await refreshTastingSales(db, event.organizationId, event.id)).updated) updated += 1;
    }
    cursor = events.length === 100 ? events.at(-1)!.id : undefined;
  } while (cursor);
  return { updated };
}
