import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../lib/prisma";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated fixture only.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    s = JSON.parse(
      readFileSync("output/contact-suggestions-fixture.json", "utf8"),
    ),
    base = "http://127.0.0.1:3102",
    browser = await chromium.launch({ channel: "chrome", headless: true }),
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
    for (const [width, height, label] of [
      [390, 844, "mobile"],
      [1440, 900, "desktop"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/wholesale/${s.account.id}`);
      await page.locator("#contact-suggestions > summary").click();
      await page
        .getByLabel("Find a suggestion", { exact: true })
        .fill(s.addresses.browser);
      const card = page.getByRole("article", {
        name: `Suggested contact ${s.addresses.browser}`,
        exact: true,
      });
      await card.waitFor();
      await card.getByText("Why this suggestion?", { exact: true }).click();
      await card.getByText("Review contact", { exact: true }).click();
      assert.equal(
        await card.getByLabel("Contact name", { exact: true }).inputValue(),
        "Browser Suggested Buyer",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `output/playwright/contact-suggestions-${label}.png`,
        fullPage: false,
      });
    }
    const card = page.getByRole("article", {
      name: `Suggested contact ${s.addresses.browser}`,
      exact: true,
    });
    await card.getByLabel("Contact name", { exact: true }).fill("");
    await card
      .getByRole("button", { name: "Add reviewed contact", exact: true })
      .click();
    assert.equal(
      await prisma.locationContact.count({
        where: { organizationId: f.orgA, email: s.addresses.browser },
      }),
      0,
    );
    await card
      .getByLabel("Contact name", { exact: true })
      .fill("Browser Confirmed Buyer");
    await card.getByLabel("I confirm this person", { exact: false }).check();
    await card
      .getByRole("button", { name: "Add reviewed contact", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Review saved" })
      .waitFor();
    assert.equal(
      await prisma.locationContact.count({
        where: {
          organizationId: f.orgA,
          email: s.addresses.browser,
          name: "Browser Confirmed Buyer",
        },
      }),
      1,
    );
    await page.reload();
    await page
      .getByText("Browser Confirmed Buyer", { exact: true })
      .first()
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/settings/communications");
    await page.locator("#contact-suggestions > summary").click();
    await page
      .getByLabel("Find a suggestion", { exact: true })
      .fill(s.addresses.unknown);
    const unknown = page.getByRole("article", {
      name: `Suggested contact ${s.addresses.unknown}`,
      exact: true,
    });
    await unknown.getByText("Review contact", { exact: true }).click();
    await unknown.getByLabel("Save as", { exact: true }).selectOption("LINK");
    const existing = await prisma.locationContact.findUniqueOrThrow({
      where: { id: s.existingContactId },
    });
    await unknown
      .getByLabel("Find existing contact", { exact: true })
      .fill(existing.email!);
    await unknown
      .getByRole("button", {
        name: `${existing.name} · ${s.account.name}`,
        exact: true,
      })
      .click();
    await unknown.getByLabel("I confirm this person", { exact: false }).check();
    await unknown
      .getByRole("button", { name: "Link reviewed contact", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Review saved" })
      .waitFor();
    assert.ok(
      (
        await prisma.locationContact.findUniqueOrThrow({
          where: { id: existing.id },
        })
      ).emailAliases.includes(s.addresses.unknown),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page
      .getByLabel("Find a suggestion", { exact: true })
      .fill("no-such-person-xyz");
    await page
      .getByText("No suggestions match your search.", { exact: true })
      .waitFor();
    await page.screenshot({
      path: "output/playwright/contact-suggestions-empty.png",
      fullPage: false,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: account Contacts and Communications integration, 390x844/1440x900, prefilled name/account, native validation, reviewed create persistence, existing-contact live search/alias link, empty search and no browser errors/overflow.",
    );
  } catch (e) {
    await page.screenshot({
      path: "output/playwright/contact-suggestions-failure.png",
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
