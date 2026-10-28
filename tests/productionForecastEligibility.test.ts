import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { configuredProducts, getProductionDashboard, getProductionProduct, summaryFor } from '../lib/productionForecasting/service';
import { forecastProduct } from '../lib/productionForecasting/engine';

const product = (code: string, market = 'OH') => ({ id: `${market}-${code}`, market, externalItemCode: code, displayName: code });
function fixture() {
  const products = ['ACTIVE', 'BAIL', 'DIST', 'DELISTED', 'UNKNOWN', 'SPECIAL'].map(code => product(code));
  products.push(product('DELISTED', 'FL'));
  const snapshots = products.map(p => ({ productId: p.id, summary: { ...summaryFor(forecastProduct({ id: p.id, code: p.externalItemCode, name: p.displayName, market: p.market }, [], [], '2026-10-27')), point: p.market === 'OH' && ['DIST', 'DELISTED'].includes(p.externalItemCode) ? 9999 : 10, target: 10 } }));
  const where: Array<Record<string, unknown>> = [], snapshotReads: unknown[] = [];
  let detailReads = 0;
  const db = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db),
    organization: { findFirst: async () => ({ id: 'org_echo_spirits', enabledStates: ['OH', 'FL'], timezone: 'America/New_York', settings: {} }) },
    organizationProduct: { findMany: async (args: { where: Record<string, unknown> }) => {
      where.push(args.where);
      assert.equal(args.where.organizationId, 'org_echo_spirits'); assert.equal(args.where.active, true); assert.equal(args.where.discontinued, false);
      assert.deepEqual(args.where.status, { in: ['OWNED', 'REPRESENTED'] });
      return args.where.market === 'OH' ? products.filter(p => p.market === 'OH') : products;
    } },
    ohlqAgencyInventoryCurrent: { findMany: async () => [{ itemCode: 'BAIL', detailCodeDescription: 'A3A Bailment' }, { itemCode: 'DIST', detailCodeDescription: 'A3A Distillery Only' }] },
    ohlqTenantInventoryImportStatus: { findFirst: async () => ({ diagnostics: { distilleryOnlyItemCodes: ['DIST'] } }) },
    ohlqBrandMasterItem: { findMany: async (args: { where: { itemCode: { in: string[] } } }) => {
      assert.ok(args.where.itemCode.in.includes('ACTIVE'));
      return [{ itemCode: 'ACTIVE', solItemStatusCode: '70' }, { itemCode: 'BAIL', solItemStatusCode: '70' }, { itemCode: 'DIST', solItemStatusCode: '70' }, { itemCode: 'DELISTED', solItemStatusCode: ' 30 ' }, { itemCode: 'SPECIAL', solItemStatusCode: '10' }];
    } },
    productionForecastRun: { findFirst: async () => ({ id: 'run', generatedAt: new Date('2026-10-28T12:00:00Z'), horizonStart: new Date('2026-10-28'), horizonEnd: new Date('2026-11-26'), dataThrough: new Date('2026-10-27'), sourceSummary: {} }) },
    productionForecastSnapshot: {
      findMany: async (args: unknown) => { snapshotReads.push(args); return snapshots; },
      findFirst: async () => { detailReads++; return { detail: {} }; },
    },
    productionSourceImport: { findMany: async () => [] },
  } as unknown as PrismaClient;
  return { db, snapshots, where, snapshotReads, detailReads: () => detailReads };
}
test('current forecast portfolio omits Distillery Only and delisted items while preserving A3A Bail, unknown status and other markets', async () => {
  const f = fixture(), products = await configuredProducts(f.db, 'org_echo_spirits', ['OH', 'FL']);
  assert.deepEqual(products.map(p => `${p.market}:${p.code}`), ['OH:ACTIVE', 'OH:BAIL', 'OH:UNKNOWN', 'OH:SPECIAL', 'FL:DELISTED']);
  assert.ok(products.every(p => !p.demandExcluded));
});
test('saved excluded snapshots cannot reappear as unavailable rows or contribute to dashboard results', async () => {
  const f = fixture(), before = JSON.stringify(f.snapshots), dashboard = await getProductionDashboard('org_echo_spirits', f.db);
  assert.deepEqual(dashboard.rows.map(r => r.product.id), ['OH-ACTIVE', 'OH-BAIL', 'OH-UNKNOWN', 'OH-SPECIAL', 'FL-DELISTED']);
  assert.equal(dashboard.rows.reduce((n, r) => n + (r.point ?? 0), 0), 50);
  const selected = f.snapshotReads[0] as { where: { organizationId: string; productId: { in: string[] } } };
  assert.equal(selected.where.organizationId, 'org_echo_spirits');
  assert.equal(selected.where.productId.in.includes('OH-DIST'), false); assert.equal(selected.where.productId.in.includes('OH-DELISTED'), false);
  assert.equal(JSON.stringify(f.snapshots), before, 'retained historical snapshots must remain unchanged');
});
test('excluded direct product links return no product before reading snapshot details or history', async () => {
  for (const id of ['OH-DIST', 'OH-DELISTED']) {
    const f = fixture();
    assert.equal(await getProductionProduct('org_echo_spirits', id, f.db), null);
    assert.equal(f.detailReads(), 0); assert.equal(f.snapshotReads.length, 0);
  }
});
