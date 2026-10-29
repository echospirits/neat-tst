// Credential-free fixture acceptance using the actual navigation/contact/briefing components and styles.
// Native disclosures/links are inspected; server actions and provider/database calls are never executed.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import ts from 'typescript';
import { FEATURE_KEYS } from '../lib/featureRegistry';

function load(path: string, mocks: Record<string, unknown> = {}) {
  const filename = resolve(path), nativeRequire = createRequire(filename), exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(code, { exports, process, URLSearchParams, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return exports;
}

async function main() {
  const button = { SubmitButton: ({ children, ...props }: any) => h('button', { ...props, type: 'submit' }, children) };
  const actions = { createAccountContact: '#fixture', saveAccountNotes: '#fixture', updateAccountContact: '#fixture' };
  const imports = load('app/account-memory/ContactImportForm.tsx', { '../components/SubmitButton': button, './actions': actions });
  const panel = load('app/account-memory/AccountMemoryPanel.tsx', {
    '../components/SubmitButton': button, './actions': actions, './ContactImportForm': imports,
    // Contact relationship network search is outside this retirement check.
    './ContactRelationships': { ContactRelationships: () => null },
  });
  const navigation = load('app/components/AppNavigation.tsx', {
    'next/navigation': { usePathname: () => '/agencies/fixture' },
    'next/link': { default: ({ children, ...props }: any) => h('a', props, children) },
  });
  const briefing = load('app/components/AccountBriefing.tsx', {
    '../../lib/prisma': { prisma: {} },
    '../../lib/crm/briefing': { getAccountBriefing: async () => ({
      health: { score: null, reasons: [], missing: ['Recent purchase evidence'] },
      indicators: { status: 'Insufficient relationship evidence', reasons: [], nextAction: 'Review existing Worklist commitments' },
    }) },
  });
  const account = { accountType: 'AGENCY', accountId: 'fixture' };
  const brief = await briefing.AccountBriefing({ account, actor: { organizationId: 'org_echo_spirits', userId: 'fixture' } });
  const styles = ['app/styles.css', 'app/crm/crm.css', 'app/redesign.css', 'app/theme.css']
    .map(path => readFileSync(path, 'utf8')).join('\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks: unknown[] = [];
  mkdirSync('output/playwright', { recursive: true });
  try {
    for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 900]] as const) {
      await page.setViewportSize({ width, height });
      for (const populated of [false, true]) {
        const permissions = { enabledFeatures: [...FEATURE_KEYS, 'COMMUNICATIONS'], isAdmin: true, isPlatformAdmin: true, isTaster: false };
        const content = renderToStaticMarkup(h('html', { lang: 'en', 'data-theme': 'light' },
          h('head', null, h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }), h('style', null, styles)),
          h('body', null,
            h('aside', null, h('div', { className: 'app-brand' }, h('strong', null, 'Neat'), h('span', null, 'Echo Spirits')), h(navigation.AppSidebarNavigation, permissions)),
            h('main', { id: 'main-content' }, h('h1', null, 'Fixture retail account'), brief,
              h(panel.AccountMemoryPanel, { accountId: 'fixture', accountType: 'AGENCY', returnTo: '/agencies/fixture', notes: populated ? 'Fixture account notes.' : null,
                contacts: populated ? [{ id: 'buyer', name: 'Fixture Buyer', role: 'Buyer', email: 'buyer@example.invalid', phone: '6145550123', notes: null, isPrimary: true, active: true }] : [],
              })),
            h(navigation.MobileTabbar, permissions)))) ;
        await page.setContent('<!doctype html>' + content, { waitUntil: 'domcontentloaded' });
        assert.equal(await page.getByRole('link', { name: 'Communications', exact: true }).count(), 0);
        assert.equal(await page.getByText(/Suggested contacts|Business text messages|Reviewed communication assistant/).count(), 0);
        assert.equal(await page.locator('a[href="/settings/communications"]').count(), 0);
        if (populated) {
          assert.equal(await page.locator('a[href="mailto:buyer@example.invalid"]').count(), 1);
          assert.equal(await page.locator('a[href="tel:6145550123"]').count(), 1);
          await page.getByText('Edit contact', { exact: true }).click();
          assert.equal(await page.locator('input[name="accountId"]').first().getAttribute('value'), 'fixture');
        } else await page.getByText('No contacts yet.', { exact: true }).waitFor();
        await page.getByText('Add or import a contact', { exact: true }).click();
        await page.getByText('Before your next conversation', { exact: false }).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} contact state overflow`);
        await page.screenshot({ path: `output/playwright/communications-retired-${name}-${populated ? 'contact' : 'empty'}.png`, fullPage: true });
        if (name === 'mobile') {
          await page.locator('.mobile-more > summary').click();
          await page.locator('.mobile-more-menu').waitFor({ state: 'visible' });
          assert.equal(await page.locator('.mobile-more-menu a[href="/alerts"]').count(), 0, 'primary Worklist stays on its tab');
          assert.equal(await page.locator('.mobile-tabbar > a[href="/alerts"]').count(), 1);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile More overflow');
          await page.screenshot({ path: `output/playwright/communications-retired-mobile-more-${populated ? 'contact' : 'empty'}.png`, fullPage: true });
        } else assert.ok(await page.locator('aside a[href="/alerts"]').count());
        checks.push({ viewport: `${width}x${height}`, populated, communicationsAbsent: true, contactContextPreserved: true, overflow: false });
      }
    }
    assert.deepEqual(errors, []);
    writeFileSync('output/playwright/communications-retirement.json', JSON.stringify({ fixtureOnly: true, checks, browserErrors: errors }, null, 2));
    console.log('PASS actual navigation/contacts/briefing fixtures at 390x844 and 1440x900; empty/populated states, native disclosures, retained contact links/context, mobile More, no overflow or browser exceptions.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
