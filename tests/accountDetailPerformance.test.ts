import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function accountPage(kind: 'agencies' | 'wholesale', options: {
  config?: Promise<object>;
  visits?: Promise<unknown[]>;
  missing?: boolean;
  mergedIntoId?: string;
} = {}) {
  const calls: string[] = [];
  const organizationId = 'org_echo_spirits';
  const account = {
    id: 'account-1', name: 'Test account', agencyId: 'agency-1', tags: [],
    mergedIntoId: options.mergedIntoId ?? null, targetPublicResearch: null,
  };
  const query = (name: string, value: unknown) => async (args: { where?: { organizationId?: string } }) => {
    calls.push(name);
    if (args.where?.organizationId) assert.equal(args.where.organizationId, organizationId);
    return value;
  };
  const prisma = {
    agency: { findUnique: query('account', options.missing ? null : account), findFirst: query('linkedAgency', null) },
    wholesaleAccount: { findUnique: query('account', options.missing ? null : account), findMany: query('mergedAccounts', []) },
    loggedVisit: { findMany: query('visits', options.visits ?? []) },
    tag: { findMany: query('tags', []) },
    user: { findMany: query('users', []) },
    organizationAccountOverlay: { findUnique: query('overlay', null) },
    locationContact: { findMany: query('contacts', []) },
    accountActivity: { findMany: query('activity', []) },
    agencyMarketProfile: { findUnique: query('marketProfile', null) },
    accountSalesStatusHistory: { findMany: query('salesStatusHistory', []) },
    accountTargetingHistory: { findMany: query('targetingHistory', []) },
    account: { findFirst: query('backingAccount', null) },
    menuPlacement: { findMany: query('placements', []) },
  };
  const dependencies: Record<string, unknown> = {
    prisma,
    requireUser: async () => ({ id: 'user-1', organizationId, role: 'ADMIN' }),
    requireOrganizationContext: async () => ({ organizationId }),
    getOrganizationTenantConfig: async () => { calls.push('config'); return options.config ?? {}; },
    getOrganizationFeatures: async () => {
      calls.push('features');
      return new Set(['ACCOUNT_SALES_STATUS', 'OHIO_DIRECT_WHOLESALE_ORDERS', 'AGENCY_INTELLIGENCE', 'WHOLESALE_OPPORTUNITIES']);
    },
    getAgencyRecentItemSales: query('sales', []),
    getWholesaleRecentPurchases: query('sales', {}),
    listWholesaleOrders: query('orders', { orders: [] }),
    getAgencyMarketFitsForDisplay: query('marketFits', []),
    getAccountSalesStatusSummary: query('salesStatus', null),
    accountWorkAndEvents: query('workAndEvents', []),
    getWholesaleLicenseeIdValues: () => [],
    getAccountResearchPilotAvailability: () => ({ available: false }),
    readOperatingHoursDetails: () => ({}),
    notFound: () => { throw new Error('not-found'); },
    redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  };
  const filename = resolve(`app/${kind}/[id]/page.tsx`);
  const nativeRequire = createRequire(filename);
  const exports: { default?: (input: unknown) => Promise<unknown> } = {};
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require: (name: string) => ['@prisma/client', 'react', 'react/jsx-runtime'].includes(name)
      ? nativeRequire(name)
      : new Proxy(dependencies, { get: (values, key: string) => values[key] ?? (() => null) }),
  });
  return { calls, run: () => exports.default!({ params: Promise.resolve({ id: account.id }), searchParams: Promise.resolve({}) }) };
}

for (const kind of ['agencies', 'wholesale'] as const) {
  test(`${kind} account reads run together without waiting for unrelated slow queries`, async () => {
    const config = deferred<object>();
    const visits = deferred<unknown[]>();
    const { calls, run } = accountPage(kind, { config: config.promise, visits: visits.promise });
    const response = run();
    await setImmediate();
    assert.ok(calls.includes('config'));
    assert.ok(calls.includes('features'), 'features should start while tenant configuration is pending');
    assert.ok(!calls.includes('visits'), 'private detail reads wait for authorized account lookup');
    config.resolve({});
    await setImmediate();
    for (const name of ['visits', 'sales', 'salesStatus', 'salesStatusHistory', 'targetingHistory', 'workAndEvents']) {
      assert.ok(calls.includes(name), `${name} should start while visit history is pending`);
    }
    visits.resolve([]);
    assert.ok(await response);
  });

  test(`${kind} missing accounts stop before private detail reads`, async () => {
    const { calls, run } = accountPage(kind, { missing: true });
    await assert.rejects(run(), /not-found/);
    assert.deepEqual(calls.filter((name) => !['config', 'features', 'account'].includes(name)), []);
  });
}

test('merged restaurant accounts redirect before private detail reads', async () => {
  const { calls, run } = accountPage('wholesale', { mergedIntoId: 'account-canonical' });
  await assert.rejects(run(), /redirect:\/wholesale\/account-canonical/);
  assert.deepEqual(calls.filter((name) => !['config', 'features', 'account'].includes(name)), []);
});
