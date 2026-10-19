import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../lib/prisma";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated rehearsal required.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    base = "http://127.0.0.1:3102",
    browser = await chromium.launch({ channel: "chrome", headless: true }),
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.name));
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
    await prisma.organizationFeature.upsert({
      where: {
        organizationId_featureKey: {
          organizationId: f.orgA,
          featureKey: "ANALYTICS",
        },
      },
      create: {
        organizationId: f.orgA,
        featureKey: "ANALYTICS",
        enabled: true,
      },
      update: { enabled: true },
    });
    await page.goto(`${base}/agencies/${f.account.accountId}`);
    await page
      .getByText("Account profile, territory & team", { exact: true })
      .click();
    await page.getByLabel("Fixture capacity", { exact: true }).fill("42");
    await page
      .locator("summary")
      .filter({ hasText: /^Documents / })
      .click();
    await page
      .getByRole("button", { name: "Add document link", exact: true })
      .click();
    const documentRows = page
      .locator("fieldset")
      .filter({ has: page.getByLabel("HTTPS link", { exact: true }) });
    const row = documentRows.last();
    await row.getByLabel("Name", { exact: true }).fill("Fixture document");
    await row
      .getByLabel("HTTPS link", { exact: true })
      .fill("https://example.invalid/fixture-document");
    await page
      .getByRole("button", { name: "Save account profile", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Account profile saved" })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page
      .locator("summary")
      .filter({ hasText: "Before your next conversation" })
      .click();
    await page
      .locator("summary")
      .filter({ hasText: "Reviewed communication assistant" })
      .click();
    await page
      .getByLabel("Review purpose", { exact: true })
      .selectOption("RESPONSE");
    assert.equal(
      await page
        .getByRole("button", { name: "Generate reviewed brief", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByLabel("I will review sources", { exact: false }).check();
    await page
      .getByRole("button", { name: "Generate reviewed brief", exact: true })
      .click();
    await page
      .getByText("Local preview: recorded excerpts", { exact: false })
      .waitFor();
    await page.getByLabel("Draft for your review").fill("Human-edited draft.");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: "output/playwright/final-mobile-account-review.png",
      fullPage: true,
    });
    await page.getByText("Filter account history", { exact: true }).click();
    await page
      .getByLabel("From date (UTC)", { exact: true })
      .fill("2099-01-01");
    await page
      .getByText("No loaded history matches", { exact: false })
      .waitFor();
    await page.getByLabel("From date (UTC)", { exact: true }).fill("");
    await page.goto(
      `${base}/visits/new?type=agency&agencyId=${f.account.accountId}`,
    );
    await page.getByText("Visit guide", { exact: true }).click();
    await page
      .getByLabel("Include these answers with the visit", { exact: true })
      .check();
    await page
      .locator('textarea[name="guideAnswer0"]')
      .fill("Fixture shelf check");
    await page
      .getByText("Draft recovery on this device", { exact: true })
      .click();
    await page
      .getByLabel("Keep a local draft while I work", { exact: true })
      .check();
    await page
      .locator('textarea[name="summary"]')
      .fill("Browser draft recovery fixture");
    await page.waitForFunction(() =>
      Object.keys(localStorage).some(
        (k) =>
          k.startsWith("neat-visit-draft:") &&
          localStorage.getItem(k)?.includes("Browser draft recovery fixture"),
      ),
    );
    await page.reload();
    await page
      .getByText("Draft recovery on this device", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restore saved draft", exact: true })
      .click();
    assert.equal(
      await page.locator('textarea[name="summary"]').inputValue(),
      "Browser draft recovery fixture",
    );
    await page
      .getByRole("button", { name: "Remove local draft", exact: true })
      .click();
    await page.getByText("Local draft removed.", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: "output/playwright/final-mobile-guided-visit.png",
      fullPage: true,
    });
    for (const [w, h, name] of [
      [390, 844, "mobile"],
      [1440, 900, "desktop"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(base + "/pipeline?view=stages");
      await page.getByText("Discovery", { exact: true }).first().waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `output/playwright/final-${name}-pipeline.png`,
        fullPage: true,
      });
      await page.goto(base + "/analytics");
      await page
        .getByText("Purchasing continuity & repeat observations", {
          exact: true,
        })
        .click();
      await page
        .getByText("Relationship execution & Pipeline estimates", {
          exact: true,
        })
        .click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `output/playwright/final-${name}-analytics.png`,
        fullPage: true,
      });
    }
    const csv = await context.request.get(
      base +
        "/analytics/export?report=relationships&preset=custom&start=2026-09-01&end=2026-10-10",
    );
    assert.equal(csv.status(), 200);
    assert.match(await csv.text(), /Team interactions/);
    assert.deepEqual(errors, []);
    console.log(
      "PASS responsive profiles/documents, reviewed mock assistant and disabled action, empty history filters, guide/draft restore, detailed Pipeline, Analytics and CSV.",
    );
  } catch (e) {
    await page.screenshot({
      path: "output/playwright/final-fields-failure.png",
      fullPage: true,
    });
    console.log("Failed path", new URL(page.url()).pathname);
    throw e;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main();
