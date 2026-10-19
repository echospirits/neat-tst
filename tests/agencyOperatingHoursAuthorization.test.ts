import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { UserRole } from '@prisma/client';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ActionResult } from '../app/components/ActionForm';
import * as operatingHours from '../lib/operatingHours';

function loadModule(path: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const filename = resolve(path);
  const require = createRequire(filename);
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(compiled, { exports, Date, URL, AbortSignal, ...globals,
    require: (name: string) => name in mocks ? mocks[name] : require(name),
  });
  return exports;
}

// Run the real platform guard as well as the real action. No session, database, or provider is created.
function platformGuard(actor: { id: string; role: UserRole; organizationId: string } | null) {
  const source = readFileSync('lib/auth.ts', 'utf8');
  const ast = ts.createSourceFile('auth.ts', source, ts.ScriptTarget.Latest, true);
  const guards = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['requirePlatformAdminSession', 'requirePlatformAdmin'].includes(node.name?.text ?? ''));
  const context: Record<string, any> = { UserRole,
    requireUserSession: async () => { if (!actor) throw new Error('redirect:/login'); return { user: actor }; },
    redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  };
  runInNewContext(ts.transpileModule(guards.map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n')
    + '\nglobalThis.guard = requirePlatformAdmin;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.guard;
}

function fixture(role: UserRole | null = UserRole.PLATFORM_ADMIN, organizationId = 'org-a', conflict: boolean | 'same-time' = false) {
  const actor = role ? { id: 'actor', role, organizationId } : null;
  const original = { schedule: [{ day: 'Monday', hours: '9:00 AM–5:00 PM' }], sourceType: 'legacy' };
  const agency: any = { id: 'agency-1', agencyId: '12345', name: 'Agency Store', address: '123 Main Street', city: 'Columbus', state: 'OH', zip: '43215', businessHours: original, updatedAt: new Date('2026-10-01') };
  const calls = { reads: 0, writes: 0, organization: 0, provider: 0, revalidated: [] as string[] };
  const api = loadModule('app/agencies/[id]/actions.ts', {
    '../../../lib/auth': { requirePlatformAdmin: platformGuard(actor), requireUser: async () => actor },
    '../../../lib/organizations': { requireOrganizationContext: async () => { calls.organization++; return { organizationId }; } },
    '../../../lib/operatingHours': operatingHours,
    '../../../lib/prisma': { prisma: { agency: {
      findUnique: async ({ where }: any) => { calls.reads++; return where.id === agency.id ? { ...agency } : null; },
      updateMany: async ({ where, data }: any) => {
        calls.writes++;
        if (conflict === 'same-time') agency.businessHours = { schedule: [{ day: 'Monday', hours: 'Open 24 hours' }], sourceType: 'concurrent' };
        if (conflict === true || where.id !== agency.id || where.updatedAt !== agency.updatedAt
          || (where.businessHours && JSON.stringify(where.businessHours.equals) !== JSON.stringify(agency.businessHours))) return { count: 0 };
        Object.assign(agency, data, { updatedAt: new Date() });
        return { count: 1 };
      },
      update: async ({ data }: any) => { calls.writes++; Object.assign(agency, data); },
    } } },
    '../../../lib/accountResearchOpenAI': { assertAccountResearchPilotEnabled: () => ({ apiKey: 'test-only' }) },
    '../../../lib/accountResearchPilot': { ACCOUNT_RESEARCH_PILOT_MODEL: 'test-model' },
    'next/cache': { revalidatePath: (path: string) => calls.revalidated.push(path) },
  }, { fetch: async () => {
    calls.provider++;
    const sourceUrl = 'https://www.ohlq.com/locations/agency-store';
    return new Response(JSON.stringify({ status: 'completed', output: [
      { type: 'web_search_call', action: { sources: [{ url: sourceUrl }] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ exactLocation: true,
        matchedName: agency.name, matchedAgencyNumber: agency.agencyId, matchedAddress: '123 Main Street, Columbus, OH 43215',
        sourceName: 'OHLQ', sourceUrl, schedule: [{ day: 'Monday', hours: '10:00 AM–6:00 PM' }],
      }) }] },
    ] }));
  } });
  return { api: api as Record<string, (form: FormData) => Promise<ActionResult>>, actor, agency, original, calls };
}

function form(hours = 'Closed') {
  const data = new FormData();
  data.set('agencyId', 'agency-1');
  data.set('hours.Monday', hours);
  data.set('role', 'PLATFORM_ADMIN');
  data.set('organizationId', 'org-b');
  data.set('savedByUserId', 'forged-actor');
  return data;
}

for (const action of ['saveAgencyOperatingHours', 'researchAgencyOperatingHours']) {
  for (const role of [UserRole.USER, UserRole.ADMIN, UserRole.TASTER, null]) {
    test(`${action} rejects ${role ?? 'unauthenticated'} callers before any shared-data or provider access`, async () => {
      for (const organizationId of ['org-a', 'org-b']) {
        const f = fixture(role, organizationId);
        await assert.rejects(f.api[action](form()), /redirect:/);
        assert.deepEqual(f.agency.businessHours, f.original);
        assert.deepEqual(f.calls, { reads: 0, writes: 0, organization: 0, provider: 0, revalidated: [] });
      }
    });
  }
}

test('platform manual curation records the trusted actor and prior hours, including a later clear', async () => {
  const f = fixture();
  assert.ok('success' in await f.api.saveAgencyOperatingHours(form()));
  const saved = JSON.parse(JSON.stringify(f.agency.businessHours));
  assert.equal(saved.sourceType, 'manual');
  assert.deepEqual(saved.schedule, [{ day: 'Monday', hours: 'Closed' }]);
  assert.equal(saved.savedByUserId, 'actor');
  assert.ok(Number.isFinite(Date.parse(saved.savedAt)));
  assert.deepEqual(saved.history[0].previous, f.original);
  assert.equal(saved.history[0].replacedByUserId, 'actor');
  assert.deepEqual(f.calls.revalidated, ['/agencies/agency-1', '/alerts', '/']);
  assert.ok('success' in await f.api.saveAgencyOperatingHours(form('')));
  assert.equal(f.agency.businessHours.schedule.length, 0);
  assert.equal(f.agency.businessHours.history.length, 2);
  const { history: _history, ...prior } = saved;
  assert.deepEqual(JSON.parse(JSON.stringify(f.agency.businessHours.history[1].previous)), prior);
});

test('platform public research preserves verified source, actor, and prior hours', async () => {
  const f = fixture();
  assert.ok('success' in await f.api.researchAgencyOperatingHours(form()));
  const saved = f.agency.businessHours;
  assert.equal(f.calls.provider, 1);
  assert.equal(saved.sourceType, 'public-web-research');
  assert.equal(saved.sourceUrl, 'https://www.ohlq.com/locations/agency-store');
  assert.equal(saved.savedByUserId, 'actor');
  assert.equal(JSON.stringify(saved.history[0].previous), JSON.stringify(f.original));
});

test('invalid manual schedules and missing agencies do not write shared hours', async () => {
  for (const hours of ['sometime tomorrow', 'x'.repeat(121)]) {
    const f = fixture();
    assert.ok('error' in await f.api.saveAgencyOperatingHours(form(hours)));
    assert.equal(f.calls.writes, 0);
  }
  for (const action of ['saveAgencyOperatingHours', 'researchAgencyOperatingHours']) {
    const f = fixture();
    const data = form(); data.set('agencyId', 'missing');
    assert.ok('error' in await f.api[action](data));
    assert.equal(f.calls.writes, 0);
    assert.equal(f.calls.provider, 0);
  }
});

for (const action of ['saveAgencyOperatingHours', 'researchAgencyOperatingHours']) {
  test(`${action} reports concurrent changes without losing shared hours or history`, async () => {
    const f = fixture(UserRole.PLATFORM_ADMIN, 'org-a', true);
    const result = await f.api[action](form());
    assert.ok('error' in result && result.error.includes('changed'));
    assert.deepEqual(f.agency.businessHours, f.original);
    assert.deepEqual(f.calls.revalidated, []);
  });
  test(`${action} preserves another save even when its timestamp matches`, async () => {
    const f = fixture(UserRole.PLATFORM_ADMIN, 'org-a', 'same-time');
    assert.ok('error' in await f.api[action](form()));
    assert.equal(f.agency.businessHours.sourceType, 'concurrent');
    assert.deepEqual(f.calls.revalidated, []);
  });
}

const Editor = loadModule('app/agencies/[id]/AgencyOperatingHoursEditor.tsx', {
  'next/navigation': { useRouter: () => ({ refresh() {} }) },
  './actions': { saveAgencyOperatingHours() {}, researchAgencyOperatingHours() {} },
  '../../components/ActionForm': { ActionForm: ({ children, className }: any) => React.createElement('form', { className }, children) },
  '../../components/SubmitButton': { SubmitButton: ({ children, pendingLabel: _pending, ...props }: any) => React.createElement('button', props, children) },
}).AgencyOperatingHoursEditor;

for (const schedule of [null, [{ day: 'Monday', hours: 'Closed' }]]) {
  test(`tenant hours view is read-only with ${schedule ? 'known' : 'unknown'} hours`, () => {
    const html = renderToStaticMarkup(React.createElement(Editor, { agencyId: 'agency-1', schedule, canEdit: false,
      sourceName: null, sourceUrl: null, researchedAt: null, researchAvailable: true }));
    assert.doesNotMatch(html, /<form|<input|<button/);
    assert.match(html, /platform administrator can update/);
    assert.match(html, schedule ? /Monday.*Closed/ : /Operating hours are not set/);
  });
}

test('platform editor retains manual controls and explains shared impact', () => {
  const html = renderToStaticMarkup(React.createElement(Editor, { agencyId: 'agency-1', schedule: null, canEdit: true,
    sourceName: null, sourceUrl: null, researchedAt: null, researchAvailable: false }));
  assert.match(html, /Save hours/);
  assert.match(html, /Research public hours/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Updates apply to every organization/);
  assert.equal((html.match(/name="hours\./g) ?? []).length, 7);
});
