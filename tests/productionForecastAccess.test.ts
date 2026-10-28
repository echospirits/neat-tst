import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { UserRole } from '@prisma/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { requireProductionForecastContext } from '../lib/productionForecasting/access';
import { getMoreNavigationItems, getNavigationItems } from '../app/components/navigationConfig';
import { ForecastTable } from '../app/analytics/production/ForecastTable';
import { summaryFor } from '../lib/productionForecasting/service';
import { forecastProduct } from '../lib/productionForecasting/engine';

const echo = { id: 'echo', displayName: 'Echo Spirits' }, other = { id: 'other', displayName: 'Other distillery' };
const actor = (role: UserRole, organizationId: string | null = 'staging') => ({ id: 'actor', role, organizationId });
function dependencies(currentId: string | null = 'staging', enrolled = [echo]) {
  return {
    tenant: async () => ({ organizationId: 'own', organization: { id: 'own', displayName: 'Own organization' } }),
    current: async () => currentId ? { organizationId: currentId } : null,
    organizations: async () => enrolled,
  };
}
test('platform administrators outside the pilot or without membership can directly open the enrolled forecast organization', async () => {
  for (const membership of ['staging', null]) {
    const result = await requireProductionForecastContext(actor(UserRole.PLATFORM_ADMIN, membership), undefined, dependencies(membership));
    assert.equal(result.organization?.id, 'echo'); assert.equal(result.platform, true);
  }
});
test('platform forecast selection preserves eligible Support View and explicit target; unknown, disabled or suspended targets are not accepted', async () => {
  const user = actor(UserRole.PLATFORM_ADMIN);
  assert.equal((await requireProductionForecastContext(user, undefined, dependencies('other', [echo, other]))).organization?.id, 'other');
  assert.equal((await requireProductionForecastContext(user, 'echo', dependencies('other', [echo, other]))).organization?.id, 'echo');
  for (const id of ['unknown', 'disabled', 'suspended']) await assert.rejects(() => requireProductionForecastContext(user, id, dependencies()), /404/);
  assert.equal((await requireProductionForecastContext(user, undefined, dependencies(null, []))).organization, null);
});
test('tenant users and organization admins cannot select another organization or bypass their feature check', async () => {
  for (const role of [UserRole.USER, UserRole.ADMIN]) {
    const services = { ...dependencies(), current: async () => { throw Error('must not read global context'); }, organizations: async () => { throw Error('must not list other tenants'); } };
    const result = await requireProductionForecastContext(actor(role, 'own'), 'own', services);
    assert.equal(result.organization?.id, 'own'); assert.equal(result.platform, false);
    await assert.rejects(() => requireProductionForecastContext(actor(role, 'own'), 'echo', services), /404/);
    await assert.rejects(() => requireProductionForecastContext(actor(role, 'own'), undefined, { ...services, tenant: async () => { throw Error('pilot-disabled'); } }), /pilot-disabled/);
  }
});
test('forecast discovery appears in desktop and mobile navigation for platform admins while regular tenant gating remains intact', () => {
  for (const platform of [false, true]) {
    assert.equal(getNavigationItems('work', [], platform).some(i => i.key === 'production-forecasting'), platform);
    assert.equal(getMoreNavigationItems(false, [], platform).some(i => i.key === 'production-forecasting'), platform);
  }
  assert.equal(getNavigationItems('work', ['PRODUCTION_FORECASTING']).some(i => i.key === 'production-forecasting'), true);
  assert.equal(getMoreNavigationItems(false, ['PRODUCTION_FORECASTING']).some(i => i.key === 'production-forecasting'), true);
});
test('mobile and desktop product links carry selected organization and filters into detail', () => {
  const product = { id: 'p', name: 'Rum', code: 'RUM', market: 'OH' };
  const row = summaryFor(forecastProduct(product, [], [], '2026-10-27'));
  const html = renderToStaticMarkup(createElement(ForecastTable, { rows: [row], initial: { q: 'Rum', confidence: 'Low' }, organizationId: echo.id }));
  assert.equal((html.match(/organization=echo/g) ?? []).length, 2);
  assert.equal((html.match(/q=Rum/g) ?? []).length, 2);
});

function importAction(user: ReturnType<typeof actor>) {
  const events: string[] = [];
  const source = ts.transpileModule(readFileSync('app/analytics/production/actions.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: { importForecastSource?: (form: FormData) => Promise<unknown> } = {};
  const deps: Record<string, unknown> = {
    'next/cache': { revalidatePath: () => undefined },
    'next/navigation': { notFound: () => { throw Error('404'); } },
    '../../../lib/auth': { requireUserSession: async () => ({ user }) },
    '../../../lib/userAccess': { isAdminRole: (role: UserRole) => role === UserRole.ADMIN || role === UserRole.PLATFORM_ADMIN },
    '../../../lib/productionForecasting/access': { requireProductionForecastContext: async (u: typeof user, id?: string) => { events.push(`authorize:${id}`); return requireProductionForecastContext(u, id, dependencies()); } },
    '../../../lib/productionForecasting/import': { importProductionSource: async (_csv: string, options: { organizationId: string }) => { events.push(`import:${options.organizationId}`); return { rowCount: 1, excludedRows: 0, replay: false }; } },
    '../../../lib/productionForecasting/service': { refreshProductionForecast: async (id: string) => { events.push(`refresh:${id}`); } },
  };
  runInNewContext(source, { exports, File, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return { execute: exports.importForecastSource!, events };
}
test('source actions require an explicit platform target, reauthorize it, and import/refresh only that organization', async () => {
  const { execute, events } = importAction(actor(UserRole.PLATFORM_ADMIN));
  const form = new FormData(); form.set('file', new File(['test'], 'source.csv')); form.set('organizationId', 'echo');
  assert.deepEqual(JSON.parse(JSON.stringify(await execute(form))), { ok: true, message: 'Imported: 1 rows, 0 excluded. Forecast snapshot is ready.' });
  assert.deepEqual(events, ['authorize:echo', 'import:echo', 'refresh:echo']);
  for (const target of ['', 'unknown']) {
    const attempt = importAction(actor(UserRole.PLATFORM_ADMIN)); form.set('organizationId', target);
    await assert.rejects(() => attempt.execute(form), /404/);
    assert.equal(attempt.events.some(e => e.startsWith('import:')), false);
  }
});
test('forged cross-tenant import targets and non-admin imports stop before side effects', async () => {
  for (const role of [UserRole.USER, UserRole.ADMIN]) {
    const attempt = importAction(actor(role, 'own')), form = new FormData(); form.set('organizationId', 'echo');
    await assert.rejects(() => attempt.execute(form), /404/);
    assert.equal(attempt.events.some(e => /^(import|refresh):/.test(e)), false);
  }
});
