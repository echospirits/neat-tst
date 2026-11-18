import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { UserRole } from '@prisma/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function loadModule(path: string, mocks: Record<string, unknown>) {
  const filename = resolve(path), require = createRequire(filename), exports: any = {};
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, Date, Intl, Response, Uint8Array, console, process,
    require: (name: string) => name in mocks ? mocks[name] : require(name),
  });
  return exports;
}

const metadata = {
  retrievalId: 'fixture-retrieval', requestedAt: '2026-11-18T13:00:00.000Z', acquiredAt: '2026-11-18T13:01:00.000Z',
  completedAt: '2026-11-18T13:01:01.000Z', requestedFrom: '2020-01-01', requestedTo: '2026-11-18',
  timezone: 'America/New_York', reportIdentity: 'Bailment PO and Invoice', parameterScope: { parameter: 'Vendor', values: 'all' },
  status: 'SUCCEEDED' as const, reason: null, contentHash: 'a'.repeat(64), rowCount: 4, validation: {},
};
const native = Buffer.from('\ufeffVendor_Name,Invoice_Number,Total,Date_Paid\r\nEcho,0001,-12.50,\r\n');
function routeFixture(options: {
  role?: UserRole; signedIn?: boolean; userOrganization?: string | null;
  contextOrganization?: string; support?: boolean; missing?: boolean; storageFailure?: boolean; contextMissing?: boolean;
} = {}) {
  const userOrganization = 'userOrganization' in options ? options.userOrganization : 'org_echo_spirits';
  const reads: string[] = [];
  const route = loadModule('app/api/admin/ohlq-bailment-report/route.ts', {
    '../../../../lib/auth': { getCurrentSession: async () => options.signedIn === false ? null : { user: {
      id: 'admin', role: options.role ?? UserRole.ADMIN, organizationId: userOrganization,
    } } },
    '../../../../lib/organizations': { getOrganizationContext: async () => options.contextMissing ? null : {
      organizationId: options.contextOrganization ?? userOrganization, isSupportView: options.support ?? false,
    } },
    '../../../../lib/ohlqBailmentReportStorage': { getCurrentOhlqBailmentReport: async (organizationId: string) => {
      reads.push(organizationId);
      if (options.storageFailure) throw new Error('private invoice amount 9999.23 and credential');
      return options.missing ? null : { csvBuffer: native, metadata };
    } },
  });
  return { route, reads };
}
function assertPrivate(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('expires'), '0');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('saved CSV download authorizes own-org administrators and returns exact native bytes without another provider run', async () => {
  for (const role of [UserRole.ADMIN, UserRole.PLATFORM_ADMIN]) {
    const fixture = routeFixture({ role });
    // Caller-controlled scope is ignored: only the durable user's own organization is passed to storage.
    const response = await fixture.route.GET(new Request('https://neat.example/api/admin/ohlq-bailment-report?organizationId=another-tenant'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="ohlq-bailment-po-and-invoice.csv"');
    assertPrivate(response);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), native);
    assert.deepEqual(fixture.reads, ['org_echo_spirits']);
  }
});

test('unauthenticated, Sales, Taster, Support View and cross-organization attempts cannot read financial payloads', async () => {
  const cases = [
    { options: { signedIn: false }, expected: 401 },
    { options: { role: UserRole.USER }, expected: 403 },
    { options: { role: UserRole.TASTER }, expected: 403 },
    { options: { support: true }, expected: 403 },
    { options: { contextOrganization: 'another-tenant' }, expected: 403 },
    { options: { userOrganization: null }, expected: 403 },
    { options: { contextMissing: true }, expected: 403 },
  ];
  for (const { options, expected } of cases) {
    const fixture = routeFixture(options);
    const response = await fixture.route.GET();
    assert.equal(response.status, expected);
    assertPrivate(response);
    assert.deepEqual(fixture.reads, []);
    assert.doesNotMatch(await response.text(), /Vendor_Name|9999/);
  }
});

test('missing saved report and retrieval errors remain private with safe recovery messages', async () => {
  for (const [options, expected, message] of [
    [{ missing: true }, 404, /No saved Bailment/],
    [{ storageFailure: true }, 503, /Try again shortly/],
  ] as const) {
    const fixture = routeFixture(options), response = await fixture.route.GET();
    assert.equal(response.status, expected);
    assertPrivate(response);
    const body = await response.text();
    assert.match(body, message);
    assert.doesNotMatch(body, /9999|credential|private invoice/);
  }
});

const { BailmentReportStatus } = loadModule('app/admin/data-status/BailmentReportStatus.tsx', {});
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(BailmentReportStatus, props));
test('admin status presents native requested range, successful retrieval and source rows beside saved download', () => {
  const html = render({ status: { current: metadata, latestAttempt: metadata } });
  assert.match(html, /Bailment PO and Invoice/);
  assert.match(html, /Last successful retrieval/);
  assert.match(html, /2020-01-01 to 2026-11-18/);
  assert.match(html, /Source rows/);
  assert.match(html, /America\/New_York/);
  assert.match(html, /Latest capture attempt:.*Saved/s);
  assert.match(html, /href="\/api\/admin\/ohlq-bailment-report"/);
  assert.match(html, /requested end date may still be in progress/);
  assert.doesNotMatch(html, /verified complete|completed full day/i);
});

test('latest failed capture keeps the previous download visible and explains its status', () => {
  const html = render({ status: { current: metadata, latestAttempt: { ...metadata, status: 'FAILED', reason: 'invalid-csv' } } });
  assert.match(html, /Latest capture attempt:.*Failed/s);
  assert.match(html, /Previous saved report remains available/);
  assert.match(html, /The downloaded report failed CSV validation/);
  assert.match(html, /Download saved CSV/);
});

test('no saved report and unavailable status provide distinct useful recovery states without dead download controls', () => {
  const empty = render({ status: { current: null, latestAttempt: null } });
  assert.match(empty, /No saved report yet/);
  assert.match(empty, /Not run yet/);
  assert.doesNotMatch(empty, /Download saved CSV/);
  const failedInitial = render({ status: { current: null, latestAttempt: { ...metadata, status: 'FAILED', reason: 'invalid-csv' } } });
  assert.match(failedInitial, /Failed/);
  assert.doesNotMatch(failedInitial, /Previous saved report remains available|Download saved CSV/);
  const unavailable = render({ status: null, unavailable: true });
  assert.match(unavailable, /status could not be loaded/);
  assert.match(unavailable, /Refresh this page/);
  assert.doesNotMatch(unavailable, /No saved report yet|Download saved CSV/);
});

