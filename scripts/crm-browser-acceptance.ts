import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
const base = "http://127.0.0.1:3102";
const fixture = JSON.parse(
  readFileSync("output/crm-rehearsal.json", "utf8"),
) as {
  sessionToken: string;
  account: { accountType: string; accountId: string };
  orgA: string;
  userA: string;
};
async function main() {
  const db = new PrismaClient();
  const firstTitle = `Browser acceptance ${Date.now()}: buyer requested follow-up`;
  const secondTitle = `${firstTitle}: second interaction`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
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
        [`/agencies/${fixture.account.accountId}`, "account"],
        ["/pipeline", "pipeline"],
        [
          `/visits/new?type=agency&agencyId=${fixture.account.accountId}`,
          "log-visit",
        ],
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
    await page.waitForURL(new RegExp(`/agencies/${fixture.account.accountId}`));
    await page.goto(`${base}/deals`);
    await page.waitForURL(/\/pipeline/);
    const visitCount = await db.loggedVisit.count({
      where: { organizationId: fixture.orgA },
    });
    for (const title of [firstTitle, secondTitle]) {
      await page.goto(
        `${base}/visits/new?type=agency&agencyId=${fixture.account.accountId}`,
      );
      await page.getByRole("button", { name: "Phone", exact: true }).click();
      await page.getByLabel("Conversation notes").fill(title);
      await page.getByLabel("Visibility").selectOption("PRIVATE");
      await page.getByLabel("Meaningful exchange with the customer").check();
      for (const choice of await page
        .getByLabel("No, leave open", { exact: true })
        .all())
        await choice.check();
      await page
        .getByRole("button", { name: "Save interaction", exact: true })
        .click();
      await page.waitForURL(/interaction=saved/);
      await page.getByText(title, { exact: false }).first().waitFor();
    }
    assert.equal(
      await db.loggedVisit.count({ where: { organizationId: fixture.orgA } }),
      visitCount,
      "Calls must not count as visits",
    );
    assert.equal(
      await db.accountActivity.count({
        where: {
          organizationId: fixture.orgA,
          summary: { in: [firstTitle, secondTitle] },
          visibility: "PRIVATE",
          meaningful: true,
        },
      }),
      2,
    );
    await page.goto(`${base}/agencies/${fixture.account.accountId}`);
    await page.getByText("Account plan & forecast", { exact: true }).click();
    await page.getByLabel("Estimated revenue (USD)").fill("4000");
    await page.getByLabel("Probability (%)").fill("50");
    await page
      .getByRole("button", { name: "Save account plan", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Account plan saved" })
      .waitFor();
    await page
      .getByLabel("Change status", { exact: true })
      .selectOption("ENGAGED");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL(/salesStatus=saved/);
    await page.goto(`${base}/pipeline`);
    await page
      .getByText("Forecast · $2,000 weighted estimate", { exact: true })
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
            "Log Visit saves calls twice without physical visits",
            "private visibility persistence",
            "legacy route redirects",
            "canonical account plan and forecast",
            "canonical Pipeline movement",
            "mock mailbox sync",
          ],
          browserErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: CRM browser acceptance at 390x844 and 1440x900, integrated logging, Pipeline forecasts/status and mock synchronization.",
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
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
