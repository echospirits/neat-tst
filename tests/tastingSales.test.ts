import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient, TastingEvent } from '@prisma/client';
import { refreshTastingSales } from '../lib/tastings/sales';

function fixture() {
  const event = { id: 'tasting-a', organizationId: 'org-a', agencyId: 'agency-internal', scheduledDate: new Date('2026-11-05'), retailBottlesSold: null, salesProductBreakdown: null, salesSourceRevision: null, salesCalculatedAt: null, salesDataSource: null } as TastingEvent;
  const report = { status: 'COMPLETED', updatedAt: new Date('2026-11-06T12:00:00Z') };
  let covered = true, enabled = true;
  let products = [{ externalItemCode: '111' }, { externalItemCode: '222' }];
  let rows = [{ agencyId: '00042', brand: '111', reportDate: '2026-11-05', bottles: 3 }, { agencyId: '00042', brand: '222', reportDate: '2026-11-05', bottles: 2 }, { agencyId: '00042', brand: '999', reportDate: '2026-11-05', bottles: 99 }, { agencyId: '99999', brand: '111', reportDate: '2026-11-05', bottles: 88 }, { agencyId: '00042', brand: '111', reportDate: '2026-11-04', bottles: 77 }];
  const history: any[] = []; let updates = 0;
  const tx: any = {
    $executeRaw: async () => 1,
    $queryRaw: async (sql: any) => { assert.ok(sql.sql.includes('COUNT(*)')); assert.ok(sql.sql.includes('"skippedRows" = 0')); return covered ? [{ reportDate: event.scheduledDate }] : []; },
    organizationFeature: { findFirst: async ({ where }: any) => enabled && where.organizationId === 'org-a' ? { id: 'feature' } : null },
    tastingEvent: {
      findFirst: async ({ where }: any) => where.id === event.id && where.organizationId === 'org-a' ? event : null,
      update: async ({ where, data }: any) => { assert.equal(where.organizationId_id.organizationId, 'org-a'); updates++; Object.assign(event, data); return event; },
    },
    agency: { findUnique: async ({ where }: any) => { assert.equal(where.id, 'agency-internal'); return { agencyId: '00042', state: 'OH' }; } },
    organizationProduct: { findMany: async ({ where }: any) => { assert.equal(where.organizationId, 'org-a'); assert.equal(where.market, 'OH'); assert.deepEqual(where.status.in, ['OWNED', 'REPRESENTED']); return products; } },
    ohlqReportImportStatus: { findUnique: async ({ where }: any) => { assert.equal(where.dataSource_reportDate.dataSource, 'ANNUAL_SALES_SUMMARY'); assert.equal(where.dataSource_reportDate.reportDate, event.scheduledDate); return report; } },
    ohlqAnnualSalesRow: { groupBy: async ({ where }: any) => rows.filter(row => row.agencyId === where.agencyId && where.brand.in.includes(row.brand) && row.reportDate === where.reportDate.toISOString().slice(0, 10)).map(row => ({ brand: row.brand, _sum: { retailBottlesSold: row.bottles } })) },
    tastingWorkflowEvent: { create: async ({ data }: any) => { history.push(data); } },
  };
  const db = { $transaction: async (run: (db: any) => Promise<any>) => run(tx) } as unknown as PrismaClient;
  return { db, event, report, history, updates: () => updates, setCovered: (v: boolean) => { covered = v; }, setEnabled: (v: boolean) => { enabled = v; }, setProducts: (v: typeof products) => { products = v; }, setRows: (v: typeof rows) => { rows = v; } };
}

test('same-day sales uses exact Agency number/date and only Organization-owned or represented OH products', async () => {
  const f = fixture();
  assert.deepEqual(await refreshTastingSales(f.db, 'org-a', f.event.id), { available: true, updated: true });
  assert.equal(f.event.retailBottlesSold, 5);
  assert.deepEqual(f.event.salesProductBreakdown, [{ itemCode: '111', retailBottlesSold: 3 }, { itemCode: '222', retailBottlesSold: 2 }]);
  assert.equal(f.event.salesSourceDataThrough?.toISOString().slice(0, 10), '2026-11-05');
  assert.match(f.event.salesDataSource!, /retail sales/); assert.ok(f.event.salesCalculatedAt);
  assert.equal(f.history.length, 1);
});

test('repeated import is idempotent; corrected source safely updates one outcome without duplicate no-op history', async () => {
  const f = fixture();
  await refreshTastingSales(f.db, 'org-a', f.event.id);
  await refreshTastingSales(f.db, 'org-a', f.event.id);
  assert.equal(f.updates(), 1); assert.equal(f.history.length, 1);
  f.report.updatedAt = new Date('2026-11-06T13:00:00Z');
  await refreshTastingSales(f.db, 'org-a', f.event.id);
  assert.equal(f.updates(), 2); assert.equal(f.history.length, 1);
  f.report.updatedAt = new Date('2026-11-06T14:00:00Z');
  f.setRows([{ agencyId: '00042', brand: '111', reportDate: '2026-11-05', bottles: -1 }]);
  await refreshTastingSales(f.db, 'org-a', f.event.id);
  assert.equal(f.event.retailBottlesSold, -1); assert.equal(f.history.length, 2);
});

test('missing, incomplete, pruned or unconfigured sales remain unknown; complete zero-sales source produces zero', async () => {
  for (const reason of ['coverage', 'status', 'products'] as const) {
    const f = fixture();
    if (reason === 'coverage') f.setCovered(false);
    if (reason === 'status') f.report.status = 'STARTED';
    if (reason === 'products') f.setProducts([]);
    await refreshTastingSales(f.db, 'org-a', f.event.id);
    assert.equal(f.event.retailBottlesSold, null); assert.equal(f.updates(), 0); assert.equal(f.history.length, 0);
  }
  const f = fixture(); f.setRows([]);
  await refreshTastingSales(f.db, 'org-a', f.event.id);
  assert.equal(f.event.retailBottlesSold, 0);
  f.setCovered(false);
  assert.deepEqual(await refreshTastingSales(f.db, 'org-a', f.event.id), { available: false, updated: false, retained: true });
  assert.equal(f.event.retailBottlesSold, 0); assert.equal(f.updates(), 1);
});

test('outcome recalculation cannot read or write another tenant or disabled feature', async () => {
  const f = fixture();
  assert.deepEqual(await refreshTastingSales(f.db, 'org-b', f.event.id), { available: false, updated: false });
  f.setEnabled(false);
  assert.deepEqual(await refreshTastingSales(f.db, 'org-a', f.event.id), { available: false, updated: false });
  assert.equal(f.updates(), 0); assert.equal(f.history.length, 0);
});
