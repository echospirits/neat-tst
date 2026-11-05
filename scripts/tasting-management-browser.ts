import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { addDaysToDateInputValue, formatEasternDateInputValue } from '../lib/dateTime';

const base = 'http://localhost:3315';
const fixture = JSON.parse(readFileSync('output/tasting-qa.json', 'utf8')) as { rehearsal: boolean; synthetic: boolean; host: string; agencyId: string; tastingId: string; futureTastingId: string; sessions: Array<{ role: string; token: string }> };
if (!fixture.rehearsal || !fixture.synthetic || !fixture.host.includes('ep-wispy-wave-ave26igj')) throw new Error('Only the explicit synthetic tasting rehearsal fixture is allowed.');
const folder = 'output/playwright/tastings';
mkdirSync(folder, { recursive: true });
mkdirSync('.impeccable/review', { recursive: true });
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const checks: string[] = [], errors: string[] = [];
  const contexts = [];
  try {
    const anonymous = await browser.newPage();
    await anonymous.goto(`${base}/tastings`); await anonymous.waitForURL(/\/login/); checks.push('unauthenticated tasting route protected'); await anonymous.close();
    for (const role of (process.argv.includes('--taster-only') || process.argv.includes('--touch-targets-only') ? ['TASTER'] : ['ADMIN', 'TASTER'])) {
      const context = await browser.newContext({ viewport: role === 'TASTER' ? { width: 390, height: 844 } : { width: 1440, height: 900 } }); contexts.push(context);
      const session = fixture.sessions.find(session => session.role === role)!;
      await context.addCookies([{ name: 'echo_session', value: session.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(90000); page.on('pageerror', error => errors.push(error.message));
      const screenshot = page.screenshot.bind(page);
      page.screenshot = async options => {
        await page.getByText('Loading contacts…', { exact: true }).waitFor({ state: 'hidden', timeout: 90000 });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(100);
        return screenshot(options);
      };
      const check = async (label: string) => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal page overflow`); checks.push(label); };
      if (process.argv.includes('--touch-targets-only')) {
        for (const [route, filename] of [[`/?view=week`, 'taster-my-week-mobile.png'], [`/agencies/${fixture.agencyId}`, 'taster-agency-mobile.png']]) {
          await page.goto(`${base}${route}`); await page.getByRole('heading', { level: 1 }).waitFor();
          const links = page.locator('.tasting-summary-link, .tasting-schedule .section-heading > a, .taster-agency-back');
          assert.ok(await links.count()); assert.ok(await links.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
          await check(`${route}: mobile record and tasting navigation targets at least 44px`);
          await page.screenshot({ path: `${folder}/${filename}`, fullPage: true });
        }
        continue;
      }
      if (role === 'ADMIN') {
        await page.goto(`${base}/tastings?view=calendar`); await page.getByRole('heading', { name: 'Tastings', exact: true }).waitFor();
        await check('desktop calendar populated and no horizontal overflow'); await page.screenshot({ path: `${folder}/admin-calendar-desktop.png`, fullPage: true }); copyFileSync(`${folder}/admin-calendar-desktop.png`, '.impeccable/review/desktop.png');
        await page.goto(`${base}/tastings/${fixture.tastingId}`); await page.getByRole('heading', { name: 'Notes for taster' }).waitFor();
        assert.ok(await page.getByRole('heading', { name: 'Internal notes', exact: true }).count()); await page.screenshot({ path: `${folder}/admin-detail-desktop.png`, fullPage: true });
        await page.goto(`${base}/tastings/${fixture.futureTastingId}?edit=1`); await page.getByRole('heading', { name: 'Edit proposal' }).waitFor(); await check('desktop editor loaded with saved context'); await page.screenshot({ path: `${folder}/admin-editor-desktop.png`, fullPage: true });
        await page.getByLabel('Date', { exact: true }).fill(addDaysToDateInputValue(formatEasternDateInputValue(), 4));
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: /spacing|days|tasting/i }).waitFor(); await check('spacing block shown and edit values retained'); await page.screenshot({ path: `${folder}/admin-spacing-error.png`, fullPage: true });
        await page.goto(`${base}/tastings/import`); await page.getByLabel('Schedule CSV').fill(`Date,Start Time,End Time,Agency ID,Coverage,Status,Retail Bottles Sold at Agency On Date,E-mails Gathered,Approved By,Joe Notes,Event_Key\n2026-12-20,16:00,18:00,${fixture.agencyId},Unmatched Synthetic Taster,State Approved,out of stock,4,Unmatched Approver,Private synthetic note,non-unique-key`);
        await page.getByRole('button', { name: 'Preview import', exact: true }).click(); await page.getByRole('heading', { name: 'Import review' }).waitFor(); assert.ok(await page.getByText(/Unmatched: Unmatched Synthetic Taster/).count()); await check('admin CSV preview flags unmatched identity using current-sheet headers'); await page.screenshot({ path: `${folder}/admin-import-review.png`, fullPage: true });
        await page.goto(`${base}/tastings/settings`); assert.equal(await page.getByRole('spinbutton').inputValue(), '10'); checks.push('centralized default spacing visible in admin settings');
      } else {
        await page.goto(`${base}/?view=week`); await page.getByRole('heading', { name: 'My Schedule', exact: true }).waitFor(); await page.screenshot({ path: `${folder}/taster-my-week-mobile.png`, fullPage: true }); assert.equal(await page.locator('select[name="view"]').inputValue(), 'week'); assert.ok(await page.locator('.tasting-summary-link, .tasting-schedule .section-heading > a').evaluateAll(links => links.every(link => link.getBoundingClientRect().height >= 44))); await check('taster My Week assigned schedule with 44px record navigation');
        await page.goto(`${base}/tastings/${fixture.tastingId}`); await page.getByRole('heading', { name: 'Notes for taster' }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Internal notes', exact: true }).count(), 0);
        assert.equal((await page.content()).includes('Synthetic coordinator notes; should be hidden'), false);
        await check('assigned taster detail hides internal notes'); await page.screenshot({ path: `${folder}/taster-detail-mobile.png`, fullPage: true }); copyFileSync(`${folder}/taster-detail-mobile.png`, '.impeccable/review/mobile.png');
        if (await page.getByRole('button', { name: 'Approve', exact: true }).count()) { const approval = page.getByRole('button', { name: 'Approve', exact: true }); const box = await approval.boundingBox(); assert.ok(box && box.y + box.height < 778, 'Assigned approval must be visible above mobile navigation'); await approval.click(); await page.getByText('Your assignment is approved.', { exact: false }).waitFor(); }
        checks.push('taster approval persisted through server action');
        await page.getByRole('link', { name: 'Log Tasting Visit', exact: true }).click();
        await page.getByRole('heading', { name: /Log Visit|Log Tasting|Log Retail/ }).waitFor();
        assert.equal(await page.locator('input[name="tastingId"]').inputValue(), fixture.tastingId);
        assert.equal(await page.locator('input[name="agencyId"]').inputValue(), fixture.agencyId);
        assert.equal(await page.locator('input[type=file]').count(), 1);
        await check('Log Tasting Visit prefilled account and tasting with single photo input'); await page.screenshot({ path: `${folder}/log-tasting-visit-mobile.png`, fullPage: true });
        await page.goto(`${base}/tastings/${fixture.futureTastingId}`); await page.locator('summary').filter({ hasText: /^Needs Edit$/ }).click();
        const comment = page.getByLabel('What needs to change?', { exact: true }); await comment.fill('Synthetic QA: I can work after five.'); await page.getByRole('button', { name: 'Send edit request', exact: true }).click(); await page.getByRole('heading', { name: 'Taster response' }).waitFor();
        assert.ok(await page.getByText('Synthetic QA: I can work after five.', { exact: true }).count()); checks.push('needs-edit comment saved and visible'); await page.screenshot({ path: `${folder}/taster-needs-edit-mobile.png`, fullPage: true });
        await page.goto(`${base}/agencies/${fixture.agencyId}`); await check('restricted taster Agency shows shared identity without private workspace'); assert.ok(await page.locator('.tasting-summary-link, .tasting-schedule .section-heading > a, .taster-agency-back').evaluateAll(links => links.every(link => link.getBoundingClientRect().height >= 44))); await page.screenshot({ path: `${folder}/taster-agency-mobile.png`, fullPage: true });
        await page.goto(`${base}/tastings?view=calendar`); await check('mobile calendar reflows to date agenda'); await page.screenshot({ path: `${folder}/taster-calendar-mobile.png`, fullPage: true });
        await page.goto(`${base}/tastings?q=NoSuchSyntheticAgency`); await page.getByRole('heading', { name: /No upcoming tastings/ }).waitFor(); await check('empty filtered schedule state'); await page.screenshot({ path: `${folder}/empty-mobile.png`, fullPage: true });
        await page.goto(`${base}/tastings/${fixture.tastingId}`); await page.evaluate(() => document.documentElement.dataset.theme = 'dark'); await page.screenshot({ path: `${folder}/taster-detail-dark-mobile.png`, fullPage: true });
        await page.setViewportSize({ width: 320, height: 844 }); await check('320px detail reflow');
      }
    }
    assert.deepEqual(errors, []);
    const receipt = process.argv.includes('--touch-targets-only') ? 'review-touch-targets.json' : 'acceptance.json';
    writeFileSync(`${folder}/${receipt}`, JSON.stringify({ checks, passed: checks.length, browserErrors: errors, synthetic: true, liveBlobUpload: false }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, browserErrors: errors.length, evidence: `${folder}/${receipt}` }));
  } finally { for (const context of contexts) await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
