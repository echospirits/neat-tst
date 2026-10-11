import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = "http://127.0.0.1:3102";
const fixture = JSON.parse(
  readFileSync("output/crm-rehearsal.json", "utf8"),
) as {
  sessionToken: string;
  account: { accountType: string; accountId: string };
  dealId: string;
};
async function main() {
  const firstTitle = `Browser acceptance ${Date.now()}: buyer requested follow-up`;
  const secondTitle = `${firstTitle}: second interaction`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.name));
  mkdirSync("output/playwright", { recursive: true });
  try {
    await page.goto(`${base}/deals`);
    await page.waitForURL(/\/login/);
    await context.addCookies([
      {
        name: "echo_session",
        value: fixture.sessionToken,
        url: base,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const query = new URLSearchParams(fixture.account).toString();
    for (const [name, width, height] of [
      ["mobile", 390, 844],
      ["desktop", 1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const [route, label] of [
        [`/activities?${query}`, "activities"],
        ["/deals", "deals"],
        [`/deals/${fixture.dealId}`, "deal-detail"],
        ["/settings/communications", "communications"],
      ]) {
        const response = await page.goto(base + route);
        assert.equal(response?.status(), 200);
        await page.locator("h1").first().waitFor();
        assert.equal(
          await page.getByText("could not load", { exact: false }).count(),
          0,
          `${label} error boundary`,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
          `${name} ${label} horizontal overflow`,
        );
        await page.screenshot({
          path: `output/playwright/crm-${name}-${label}.png`,
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/activities?${query}`);
    await page.getByText("Log activity for", { exact: false }).click();
    const summary = page.getByLabel("What happened?");
    await summary.fill(firstTitle);
    await page
      .getByLabel("Visible to", { exact: true })
      .selectOption("PRIVATE");
    await page
      .getByRole("button", { name: "Save activity", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Activity saved" })
      .waitFor();
    await page
      .getByRole("heading", {
        name: firstTitle,
        exact: true,
      })
      .waitFor();
    // A second submission must create a new event, rather than replay the prior form's idempotency key.
    await summary.fill(secondTitle);
    await page
      .getByRole("button", { name: "Save activity", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: secondTitle,
        exact: true,
      })
      .waitFor();
    await page.getByLabel("Activity type", { exact: true }).selectOption("SMS");
    await page.getByRole("heading", { name: "No visible activity" }).waitFor();
    await page.goto(`${base}/deals?${query}`);
    await page.getByText("Create deal for", { exact: false }).click();
    await page
      .getByLabel("Deal title", { exact: true })
      .fill("Browser acceptance deal");
    await page
      .getByRole("button", { name: "Create deal", exact: true })
      .click();
    await page.waitForURL(/\/deals\//);
    await page
      .getByRole("heading", { name: "Browser acceptance deal", exact: true })
      .waitFor();
    await page.getByLabel("Outcome", { exact: true }).selectOption("LOST");
    await page.getByRole("button", { name: "Save deal progress" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Explain the loss" })
      .waitFor();
    await page
      .getByLabel("Reason (required for loss or reopening)")
      .fill("Buyer chose another supplier");
    await page.getByRole("button", { name: "Save deal progress" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Deal updated" })
      .waitFor();
    await page.goto(`${base}/settings/communications`);
    await page.getByText("Try fixture mode", { exact: true }).click();
    await page.getByRole("button", { name: "Create demo connection" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Demo connection created" })
      .waitFor();
    await page.getByRole("button", { name: "Synchronize next page" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "source record(s) processed" })
      .waitFor();
    await page
      .getByRole("heading", {
        name: "Demo: follow-up after product presentation",
      })
      .waitFor();
    assert.deepEqual(errors, [], "No uncaught browser exceptions");
    writeFileSync(
      "output/playwright/crm-acceptance.json",
      JSON.stringify(
        {
          passed: true,
          viewports: ["390x844", "1440x900"],
          routes: 4,
          checks: [
            "unauthenticated redirect",
            "no horizontal overflow",
            "manual save twice",
            "private visibility selection",
            "empty filter",
            "deal creation",
            "loss validation and save",
            "mock mailbox sync",
          ],
          browserErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: CRM browser acceptance at 390x844 and 1440x900, activity saves, filtering, deal creation/outcomes and mock synchronization.",
    );
  } catch (error) {
    await page.screenshot({
      path: "output/playwright/crm-failure.png",
      fullPage: true,
    });
    console.error("Last page:", page.url());
    console.error((await page.locator("main").innerText()).slice(-2500));
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
