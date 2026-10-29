import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../lib/prisma";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated rehearsal required.");
const base = "http://127.0.0.1:3102";
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8"));
  const browser = await chromium.launch({ channel: "chrome", headless: true }),
    context = await browser.newContext(),
    page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await context.addCookies([
    {
      name: "echo_session",
      value: f.sessionToken,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  try {
    for (const [w, h, name] of [
      [390, 844, "mobile"],
      [1440, 900, "desktop"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      for (const [path, label] of [
        ["/", "schedule"],
        ["/admin/organization", "organization"],
      ] as const) {
        const response = await page.goto(base + path);
        assert.equal(response?.status(), 200);
        await page.locator("h1").first().waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${name} ${label} overflow`,
        );
        await page.screenshot({
          path: `output/playwright/extensions-${name}-${label}.png`,
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/admin/organization");
    await page
      .getByText("Relationship health & Pipeline thresholds", { exact: true })
      .click();
    await page.getByLabel("Agency contact interval (days)").fill("22");
    await page
      .getByRole("button", { name: "Save relationship thresholds" })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Relationship thresholds saved" })
      .waitFor();
    await page.getByText("Manage playbook templates", { exact: true }).click();
    await page.getByRole("button", { name: "Add starter templates" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Starter templates added" })
      .waitFor();
    await page.goto(`${base}/agencies/${f.account.accountId}`);
    const work = page.locator("#account-worklist");
    await work
      .locator("summary")
      .filter({ hasText: /^Playbooks/ })
      .click();
    await work
      .locator("summary")
      .filter({ hasText: "Choose a playbook" })
      .click();
    await work
      .getByRole("button", { name: "Menu placement", exact: true })
      .click();
    await work
      .getByRole("button", { name: "Add steps to Worklist", exact: true })
      .click();
    await work
      .getByRole("status")
      .filter({ hasText: /tasks added|already on/ })
      .waitFor();
    await work
      .getByRole("article", {
        name: "Review menu placement opportunities",
        exact: true,
      })
      .first()
      .waitFor();
    await page.goto(base + "/");
    await page
      .locator("summary")
      .filter({ hasText: "Events and staff schedule" })
      .click();
    await page.getByText("Add event or shift", { exact: true }).click();
    await page
      .getByLabel("Event title", { exact: true })
      .fill(`Browser event ${Date.now()}`);
    await page.getByLabel("Starts (your local time)").fill("2026-11-20T14:00");
    await page.getByLabel("Ends (your local time)").fill("2026-11-20T15:00");
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.waitForURL(/\/events\/[^/]+$/);
    await page
      .getByRole("heading", { name: "Observed sales before and after" })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: "output/playwright/event-mobile-detail.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS responsive extension pages; health settings; playbook Worklist; scheduled event.",
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main();
