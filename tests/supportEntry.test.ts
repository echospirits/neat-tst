import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as shared from '../lib/supportShared';

const PageHeader = ({ title, actions }: any) => createElement('header', null, createElement('h1', null, title), actions);
const loadPage = (path: string, dependencies: Record<string, unknown>) => {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, any> = {};
  const deps: Record<string, unknown> = { 'react/jsx-runtime': require('react/jsx-runtime'), 'next/link': { default: 'a' }, ...dependencies };
  runInNewContext(compiled, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; }, URLSearchParams });
  return exports.default;
};

test('the actual Support page renders a working new-ticket link for every role and for the platform My tickets view', async () => {
  for (const role of ['USER', 'ADMIN', 'TASTER', 'PLATFORM_ADMIN']) for (const scope of ['', 'mine']) {
    const page = loadPage('app/support/page.tsx', {
      '../../lib/auth': { requireUserSession: async ({ allowTaster }: any) => { assert.equal(allowTaster, true); }, getUserDisplayName: () => 'Reporter' },
      '../../lib/appBrand': { buildPageMetadata: () => ({}) },
      '../../lib/support': { listSupportTickets: async () => ({ actor: { role, id: 'user' }, tickets: [], total: 0, page: 1 }) },
      '../../lib/supportShared': shared,
      '../components/PageChrome': { PageHeader, EmptyState: () => null },
      '../components/LiveFilterForm': { LiveFilterForm: ({ children }: any) => createElement('form', null, children) },
    });
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ scope }) }));
    assert.match(html, /href="\/support\/new"[^>]*>New support ticket<\/a>/, `${role} ${scope}`);
  }
});

test('the actual new-ticket page permits a platform admin with no organization context and supplies searchable organization choices', async () => {
  let form: any;
  const page = loadPage('app/support/new/page.tsx', {
    '../../../lib/auth': { requireUserSession: async () => ({ user: { id: 'platform', role: 'PLATFORM_ADMIN', organizationId: null } }) },
    '../../../lib/appBrand': { buildPageMetadata: () => ({}) },
    '../../../lib/appEnvironment': { isSideEffectEnabled: () => true },
    '../../../lib/organizations': { getOrganizationContext: async () => null, requireOrganizationContext: () => { throw new Error('Must not require Support View'); } },
    '../../../lib/prisma': { prisma: { organization: { findMany: async ({ select }: any) => { assert.deepEqual({ ...select }, { id: true, displayName: true }); return [{ id: 'org-a', displayName: 'First' }, { id: 'org-b', displayName: 'Second' }]; } } } },
    '../../components/PageChrome': { PageHeader },
    '../SupportReportForm': { SupportReportForm: (props: any) => { form = props; return createElement('form'); } },
  });
  assert.match(renderToStaticMarkup(await page()), /New support ticket/);
  assert.equal(form.initialOrganizationId, ''); assert.equal(form.organizations.length, 2); assert.equal(form.screenshotsEnabled, true);
});

test('the new-ticket page preserves known organization context and does not expose platform organization choices to tenant roles', async () => {
  for (const role of ['USER', 'ADMIN', 'TASTER', 'PLATFORM_ADMIN']) {
    let form: any;
    const context = async () => ({ organizationId: 'org-b' });
    const page = loadPage('app/support/new/page.tsx', {
      '../../../lib/auth': { requireUserSession: async () => ({ user: { id: 'user', role, organizationId: 'org-b' } }) },
      '../../../lib/appBrand': { buildPageMetadata: () => ({}) },
      '../../../lib/appEnvironment': { isSideEffectEnabled: () => true },
      '../../../lib/organizations': { getOrganizationContext: context, requireOrganizationContext: context },
      '../../../lib/prisma': { prisma: { organization: { findMany: async () => { assert.equal(role, 'PLATFORM_ADMIN'); return [{ id: 'org-b', displayName: 'Second' }]; } } } },
      '../../components/PageChrome': { PageHeader },
      '../SupportReportForm': { SupportReportForm: (props: any) => { form = props; return createElement('form'); } },
    });
    renderToStaticMarkup(await page());
    assert.equal(form.initialOrganizationId, 'org-b'); assert.equal(form.scope, 'user:org-b'); assert.equal(form.screenshotsEnabled, true);
    assert.equal(Boolean(form.organizations), role === 'PLATFORM_ADMIN');
  }
});
