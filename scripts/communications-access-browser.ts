import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { prisma, runWithOrganizationStateAccess } from "../lib/prisma";
import { ingestMailChanges } from "../lib/crm/mail/sync";
import { loadContactSuggestions } from "../lib/crm/contactSuggestions";

if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated fixtures only.");

async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8"));
  const s = JSON.parse(
    readFileSync("output/contact-suggestions-fixture.json", "utf8"),
  );
  assert.match(f.orgA, /^crm_qa_a_/);
  // Revoke only this script's synthetic sessions left behind by an interrupted run.
  const fixtureUsers = {
    organizationId: f.orgA,
    role: "PLATFORM_ADMIN" as const,
    name: "Platform acceptance",
    email: { startsWith: "platform-", endsWith: "@brand.invalid" },
  };
  await prisma.userSession.deleteMany({ where: { user: fixtureUsers } });
  await prisma.user.updateMany({
    where: fixtureUsers,
    data: { isActive: false },
  });
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      organizationId: f.orgA,
      email: `platform-${id}@brand.invalid`,
      name: "Platform acceptance",
      role: "PLATFORM_ADMIN",
      isActive: true,
    },
  });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  let browser: Browser | undefined;
  try {
    const actor = { organizationId: f.orgA, userId: user.id };
    const buyer = `platform-buyer-${id}@restaurant.invalid`;
    const connection = await prisma.mailboxConnection.create({
      data: {
        ...actor,
        provider: `FIXTURE_${id}`,
        providerAccountId: id,
        email: user.email,
        scope: "fixture",
      },
    });
    await prisma.$transaction((tx) =>
      ingestMailChanges(tx, actor, connection, [
        {
          id,
          kind: "EMAIL",
          at: new Date().toISOString(),
          subject: "Platform private acceptance evidence",
          participants: [user.email, buyer],
          participantNames: { [buyer]: "Platform Buyer" },
          direction: "INBOUND",
        },
      ]),
    );
    await prisma.accountActivity.updateMany({
      where: { connectionId: connection.id },
      data: { wholesaleAccountId: s.account.id },
    });
    await runWithOrganizationStateAccess(f.orgA, async () => {
      const own = await loadContactSuggestions(prisma, actor);
      assert.ok(own.suggestions.some((row) => row.value === buyer));
      assert.ok(
        own.suggestions
          .filter((row) => row.channel === "EMAIL")
          .every((row) => row.value === buyer),
        "Platform role must not expose colleagues mail",
      );
      const peer = await loadContactSuggestions(prisma, {
        organizationId: f.orgA,
        userId: f.userA,
      });
      assert.ok(!peer.suggestions.some((row) => row.value === buyer));
      await assert.rejects(
        loadContactSuggestions(prisma, {
          organizationId: f.orgB,
          userId: user.id,
        }),
        /membership/,
      );
    });
    console.log(
      "PASS: isolated platform membership, own private evidence and cross-tenant denial. Opening browser.",
    );
    browser = await chromium.launch({ headless: true, timeout: 20000 });
    const context = await browser.newContext();
    const page = await context.newPage();
    const base = "http://127.0.0.1:3102";
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(30000);
    await context.addCookies([
      {
        name: "echo_session",
        value: token,
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
        await page.goto(`${base}/profile`);
        const nav = page.getByRole("navigation", {
          name: width === 390 ? "Quick field actions" : "Primary navigation",
          exact: true,
        });
        if (width === 390)
          await nav.locator("summary").filter({ hasText: "More" }).click();
        await nav
          .getByRole("link", { name: "Communications", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Mailbox privacy", exact: true })
          .waitFor();
        await page.locator("#contact-suggestions > summary").click();
        await page
          .getByRole("article", {
            name: `Suggested contact ${buyer}`,
            exact: true,
          })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await page.screenshot({
          path: `output/playwright/communications-access-${label}.png`,
        });
      }
      const card = page.getByRole("article", {
        name: `Suggested contact ${buyer}`,
        exact: true,
      });
      await card.getByText("Review contact", { exact: true }).click();
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
          where: { organizationId: f.orgA, email: buyer },
        }),
        1,
      );
      await page.reload();
      assert.equal(
        await page
          .getByRole("article", {
            name: `Suggested contact ${buyer}`,
            exact: true,
          })
          .count(),
        0,
      );
      // No live provider is configured in this rehearsal. Reaching this redirect proves
      // the own-mailbox OAuth entry point passed authorization without contacting one.
      const connect = await context.request.get(
        `${base}/api/crm/mail/google/connect`,
        { maxRedirects: 0 },
      );
      assert.equal(connect.status(), 307);
      assert.match(connect.headers().location, /status=not-configured/);
      for (const org of [f.orgA, f.orgB]) {
        await context.addCookies([
          {
            name: "neat_support_organization",
            value: org,
            url: base,
            httpOnly: true,
          },
        ]);
        await page.goto(`${base}/settings/communications`);
        await page
          .getByText(
            /Exit Support View to use your own organization's Communications/,
          )
          .waitFor();
        assert.equal(await page.locator("#contact-suggestions").count(), 0);
        assert.equal(
          await page.getByRole("heading", { name: "Mailbox privacy" }).count(),
          0,
        );
        await page.goto(`${base}/wholesale/${s.account.id}`);
        assert.equal(await page.locator("#contact-suggestions").count(), 0);
      }
      await context.clearCookies({ name: "neat_support_organization" });
      await page.goto(`${base}/settings/communications`);
      await page.getByRole("heading", { name: "Mailbox privacy" }).waitFor();
      assert.deepEqual(errors, []);
      console.log(
        "PASS: platform own-mailbox access, owner-only evidence, tenant denial, reviewed contact save, OAuth entry authorization, same/other-tenant Support View denial, exit recovery, desktop navigation and mobile More at 390x844/1440x900 without overflow.",
      );
    } catch (e) {
      await page.screenshot({
        path: "output/playwright/communications-access-failure.png",
        fullPage: true,
      });
      throw e;
    }
  } finally {
    await browser?.close();
    await prisma.userSession.delete({ where: { id: session.id } });
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    await prisma.$disconnect();
  }
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
