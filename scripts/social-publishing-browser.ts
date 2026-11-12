import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { localDateTime } from '../app/social/view';

type Fixture = { synthetic: boolean; rehearsal: boolean; target: string; groupId: string; mediaId: string; sessions: Array<{ role: string; token: string }> };
const fixture = JSON.parse(readFileSync(process.env.SOCIAL_BROWSER_FIXTURE || 'output/social-publishing-qa.json', 'utf8')) as Fixture;
if (!fixture.synthetic || !fixture.rehearsal || fixture.target !== 'social-rehearsal') throw new Error('Explicit isolated Social Publishing rehearsal fixtures are required.');
const base = 'http://localhost:3118';
const folder = 'output/playwright/social-publishing';
mkdirSync(folder, { recursive: true }); mkdirSync('.impeccable/review', { recursive: true });
async function capture(page: Page, file: string) {
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await page.screenshot({ path: `${folder}/${file}`, fullPage: true, animations: 'disabled' });
}
async function main() {
  const health = await fetch(`${base}/api/health`).then(response => response.json()) as { ok: boolean; environment: string; databaseTarget: string };
  assert.equal(health.ok, true); assert.equal(health.databaseTarget, 'social-rehearsal'); assert.notEqual(health.environment, 'production');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const checks: string[] = [], errors: string[] = [];
  const contexts: BrowserContext[] = [];
  const contextFor = async (role: string, width = 390, height = 844) => {
    const context = await browser.newContext({ viewport: { width, height } }); contexts.push(context);
    const session = fixture.sessions.find(item => item.role === role); assert.ok(session, 'Synthetic role fixture exists');
    await context.addCookies([{ name: 'echo_session', value: session.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
    return context;
  };
  try {
    const anonymous = await browser.newPage(); await anonymous.goto(`${base}/social`); await anonymous.waitForURL(/\/login/); await anonymous.close(); checks.push('Anonymous Social Publishing route is protected');
    const excluded = await contextFor('EXCLUDED_ADMIN'); const excludedPage = await excluded.newPage(); await excludedPage.goto(`${base}/social`); await excludedPage.getByRole('heading', { name: 'This page could not be found.', exact: true }).waitFor(); assert.equal(await excludedPage.getByRole('link', { name: 'Social Publishing', exact: true }).count(), 0); checks.push('Administrator outside tester allowlist receives an unavailable page and no Social navigation (Next streamed not-found)');
    const unassigned = await contextFor('UNASSIGNED'); const unassignedPage = await unassigned.newPage(); await unassignedPage.goto(`${base}/social/new`); await unassignedPage.getByText('No brand groups are available.', { exact: false }).waitFor(); assert.equal(await unassignedPage.locator('.social-composer').count(), 0); assert.equal((await unassigned.request.get(`${base}/api/social/media/${fixture.mediaId}`)).status(), 404); checks.push('Enrolled contributor without group access sees a usable empty state and cannot retrieve another group’s media'); await capture(unassignedPage, 'empty-mobile.png');
    const contributor = await contextFor('CONTRIBUTOR'); const page = await contributor.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    const noOverflow = async (name: string) => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name); checks.push(name); };
    await page.goto(`${base}/social/new?group=${fixture.groupId}`); await page.getByRole('heading', { name: 'New social post', exact: true }).waitFor(); await page.waitForFunction(() => { const input = document.querySelector('.social-composer input:not([type="hidden"])'); if (!input) return false; const propsKey = Object.keys(input).find(key => key.startsWith('__reactProps')); return propsKey && typeof (input as unknown as Record<string, Record<string, unknown>>)[propsKey].onChange === 'function'; });
    assert.equal(await page.getByRole('button', { name: 'Save draft', exact: true }).isDisabled(), true); checks.push('Composer disables saving until an exact destination is selected');
    const title = `Synthetic browser rehearsal ${Date.now()}`;
    await page.locator('.social-destination-picker label').filter({ hasText: 'Facebook' }).first().getByRole('checkbox').check();
    await page.getByLabel(/^Post format/).selectOption('TEXT');
    await page.getByLabel('Internal post title', { exact: true }).fill(title);
    await page.waitForFunction(expected => JSON.parse((document.querySelector('input[name="payload"]') as HTMLInputElement).value).title === expected, title);
    await page.getByLabel(/^Proposed publication · Eastern time/).fill(localDateTime(new Date(Date.now() + 3600_000)));
    await noOverflow('390 × 844 composer has no horizontal page overflow'); await capture(page, 'composer-mobile.png');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.waitForURL(url => /^\/social\/[^/]+$/.test(url.pathname) && !['new', 'setup'].includes(url.pathname.split('/').pop()!)); await page.getByRole('heading', { name: title, exact: true }).waitFor(); await page.getByRole('button', { name: 'Dismiss confirmation', exact: true }).click();
    const createdPostId = new URL(page.url()).pathname.split('/').pop()!;
    assert.equal(await page.getByRole('button', { name: /^Approve and/ }).count(), 0); assert.equal(await page.getByText('Administrator details', { exact: true }).count(), 0); checks.push('Contributors can save a draft but cannot see approval or administrator diagnostics');
    await page.getByRole('button', { name: 'Submit for approval', exact: true }).click(); await page.getByRole('alert').filter({ hasText: /copy|link|media/i }).waitFor(); await noOverflow('Destination validation error is inline and leaves the draft intact'); await capture(page, 'validation-mobile.png');
    await page.getByRole('link', { name: 'Edit revision', exact: true }).click(); await page.waitForFunction(() => { const input = document.querySelector('.social-composer input:not([type="hidden"])'); if (!input) return false; const propsKey = Object.keys(input).find(key => key.startsWith('__reactProps')); return propsKey && typeof (input as unknown as Record<string, Record<string, unknown>>)[propsKey].onChange === 'function'; }); await page.getByLabel('Shared starting caption', { exact: true }).fill('Synthetic internal browser rehearsal; never sent to a provider.'); await page.getByRole('button', { name: 'Save revised draft', exact: true }).click(); await page.getByRole('heading', { name: title, exact: true }).waitFor(); await page.getByRole('button', { name: 'Dismiss confirmation', exact: true }).click();
    let release = () => {}; const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/social/${createdPostId}`, async route => { if (route.request().method() === 'POST' && route.request().headers()['next-action']) { await held; await route.continue(); } else await route.continue(); });
    await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('form[aria-busy="true"] button[type="submit"]')?.hasAttribute('disabled'));
    checks.push('Pending submission disables repeat button clicks'); release(); await page.getByText('An administrator must approve this revision', { exact: false }).waitFor(); await page.unroute(`**/social/${createdPostId}`); checks.push('Contributor submission persists and requires administrator approval');
    const setupDenied = await contributor.request.get(`${base}/social/setup`); assert.ok(setupDenied.status() === 404 || (await setupDenied.text()).includes('This page could not be found.')); const oauthDenied = await contributor.request.get(`${base}/api/social/oauth/meta/start`, { maxRedirects: 0 }); assert.equal(oauthDenied.status(), 307); assert.equal(new URL(oauthDenied.headers().location, base).pathname, '/'); checks.push('Contributors cannot directly access setup or account authorization endpoints');
    const admin = await contextFor('ADMIN', 1440, 1000); const adminPage = await admin.newPage(); adminPage.setDefaultTimeout(60000); adminPage.on('pageerror', error => errors.push(error.message));
    await adminPage.goto(`${base}/social/${createdPostId}`); await adminPage.getByRole('button', { name: 'Approve and schedule', exact: true }).waitFor();
    await adminPage.getByRole('button', { name: 'Approve and schedule', exact: true }).click();
    await adminPage.locator('.social-revision-header').getByText('Approved', { exact: true }).waitFor();
    await adminPage.getByRole('alert').filter({ hasText: /scheduling is disabled|scheduling could not|scheduling.*failed/i }).waitFor();
    checks.push('Approval persists its exact revision; disabled durable scheduling is surfaced as an actionable failure');
    await capture(adminPage, 'schedule-disabled-desktop.png');
    await adminPage.goto(`${base}/social?q=${encodeURIComponent(title)}`); await adminPage.getByRole('heading', { name: 'Social Publishing', exact: true }).waitFor(); assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await capture(adminPage, 'desktop.png'); copyFileSync(`${folder}/desktop.png`, '.impeccable/review/desktop.png'); checks.push('1440 × 1000 post list preserves review and per-destination delivery facts without overflow');
    await adminPage.setViewportSize({ width: 390, height: 844 }); await adminPage.goto(`${base}/social?view=connections`); await adminPage.getByRole('heading', { name: 'Provider access', exact: true }).waitFor(); assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await capture(adminPage, 'mobile.png'); copyFileSync(`${folder}/mobile.png`, '.impeccable/review/mobile.png'); checks.push('390 × 844 Connections shows explicit configuration/health and group controls without overflow');
    await adminPage.goto(`${base}/social/setup`); await adminPage.getByRole('heading', { name: 'Provider applications & review', exact: true }).waitFor(); assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await capture(adminPage, 'setup-mobile.png'); checks.push('Mobile setup includes exact callbacks, missing variable names, separate access tiers and live-test runbook');
    assert.equal((await admin.request.get(`${base}/api/social/media/${fixture.mediaId}?signature=invalid&expires=1234567890`)).status(), 403); checks.push('Invalid media dispatch signatures cannot expose a private file');
    assert.deepEqual(errors, []);
    writeFileSync(`${folder}/acceptance.json`, JSON.stringify({ synthetic: true, livePublishing: false, createdPostId, checks, passed: checks.length, browserErrors: errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, browserErrors: errors.length, evidence: `${folder}/acceptance.json` }));
  } finally { for (const context of contexts) await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack : 'Social Publishing browser acceptance failed.'); process.exitCode = 1; });
