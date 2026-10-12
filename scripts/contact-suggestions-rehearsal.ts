import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma, runWithOrganizationStateAccess } from "../lib/prisma";
import { ingestMailChanges } from "../lib/crm/mail/sync";
import {
  loadContactSuggestions,
  reviewContactSuggestion,
} from "../lib/crm/contactSuggestions";
import { suggestionKey } from "../lib/crm/contactSuggestionRules";
import { receiveSms } from "../lib/crm/sms/service";
if (
  process.env.CRM_REHEARSAL !== "true" ||
  process.env.DATABASE_TARGET_ID !== "crm-isolated-rehearsal"
)
  throw Error("Isolated fixtures required.");
async function main() {
  const f = JSON.parse(readFileSync("output/crm-rehearsal.json", "utf8")),
    actor = { organizationId: f.orgA, userId: f.userA },
    peer = { organizationId: f.orgA, userId: f.colleague },
    id = randomUUID().slice(0, 8),
    now = new Date();
  assert.ok(peer.userId, "Peer fixture required");
  await runWithOrganizationStateAccess(f.orgA, async () => {
    const account = await prisma.wholesaleAccount.findFirstOrThrow({
        where: { mergedIntoId: null },
        select: { id: true, name: true },
      }),
      target = { accountType: "WHOLESALE" as const, accountId: account.id };
    const connection = await prisma.mailboxConnection.create({
      data: {
        ...actor,
        provider: `FIXTURE_SUGGESTIONS_${id}`,
        providerAccountId: `suggestions-${id}`,
        email: `owner-${id}@brand.invalid`,
        scope: "fixture",
        internalDomains: ["brand.invalid"],
      },
    });
    const addresses = {
      sarah: `sarah-${id}@restaurant.invalid`,
      alias: `alias-${id}@restaurant.invalid`,
      dismiss: `dismiss-${id}@restaurant.invalid`,
      stale: `stale-${id}@restaurant.invalid`,
      browser: `browser-${id}@restaurant.invalid`,
      unknown: `unknown-${id}@restaurant.invalid`,
    };
    const messages = Object.entries(addresses).flatMap(([label, email]) =>
      ["INBOUND", "OUTBOUND"].map((direction, n) => ({
        id: `${label}-${n}`,
        kind: "EMAIL" as const,
        at: now.toISOString(),
        subject: `Private fixture ${label}`,
        participants: [
          connection.email,
          email,
          "noreply@mailer.invalid",
          "colleague@brand.invalid",
        ],
        participantNames: {
          [email]:
            label === "browser" ? "Browser Suggested Buyer" : "Sarah Fixture",
        },
        direction: direction as "INBOUND" | "OUTBOUND",
      })),
    );
    await prisma.$transaction((tx) =>
      ingestMailChanges(tx, actor, connection, messages),
    );
    await prisma.accountActivity.updateMany({
      where: {
        organizationId: f.orgA,
        connectionId: connection.id,
        participants: { has: addresses.browser },
      },
      data: { wholesaleAccountId: account.id },
    });
    let result = await loadContactSuggestions(prisma, actor);
    const sarah = result.suggestions.find((s) => s.value === addresses.sarah)!;
    assert.ok(sarah);
    assert.equal(sarah.incoming, 1);
    assert.equal(sarah.outgoing, 1);
    assert.equal(sarah.name, "Sarah Fixture");
    assert.equal(sarah.accounts.length, 0);
    assert.ok(
      !result.suggestions.some(
        (s) =>
          s.value.includes("brand.invalid") ||
          s.value === "noreply@mailer.invalid",
      ),
    );
    assert.ok(
      !(await loadContactSuggestions(prisma, peer)).suggestions.some(
        (s) => s.value === addresses.sarah,
      ),
    );
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          reviewContactSuggestion(
            tx,
            { organizationId: f.orgB, userId: f.userB },
            {
              key: sarah.key,
              operation: "CREATE",
              ...target,
              name: "Forbidden",
              confirmed: "true",
            },
          ),
        ),
      /no longer available/,
    );
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          reviewContactSuggestion(
            tx,
            { organizationId: f.orgA, userId: f.userB },
            { key: sarah.key, operation: "DISMISS" },
          ),
        ),
      /membership/,
    );
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          reviewContactSuggestion(tx, actor, {
            key: sarah.key,
            operation: "CREATE",
            ...target,
            name: "Missing review",
          }),
        ),
      /Confirm/,
    );
    const accept = () =>
      prisma.$transaction(
        (tx) =>
          reviewContactSuggestion(tx, actor, {
            key: sarah.key,
            operation: "CREATE",
            ...target,
            name: "Sarah Confirmed",
            confirmed: "true",
          }),
        { timeout: 30000, maxWait: 30000 },
      );
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          reviewContactSuggestion(tx, actor, {
            key: sarah.key,
            operation: "CREATE",
            accountType: "WHOLESALE",
            accountId: "missing-fixture-account",
            name: "Invalid",
            confirmed: "true",
          }),
        ),
      /Account not found/,
    );
    const accepted = await Promise.all([accept(), accept()]);
    assert.equal(accepted[0].contactId, accepted[1].contactId);
    assert.equal(
      await prisma.locationContact.count({
        where: { organizationId: f.orgA, email: addresses.sarah },
      }),
      1,
    );
    const source = await prisma.accountActivity.findFirstOrThrow({
      where: {
        organizationId: f.orgA,
        connectionId: connection.id,
        participants: { has: addresses.sarah },
      },
    });
    assert.equal(source.visibility, "PRIVATE");
    assert.equal(source.wholesaleAccountId, account.id);
    assert.equal(source.contactId, accepted[0].contactId);
    const existing = await prisma.locationContact.create({
      data: {
        organizationId: f.orgA,
        wholesaleAccountId: account.id,
        name: "Existing Fixture Buyer",
        email: `primary-${id}@restaurant.invalid`,
        createdByUserId: f.userA,
      },
    });
    await prisma.$transaction(
      (tx) =>
        reviewContactSuggestion(tx, actor, {
          key: suggestionKey("EMAIL", addresses.alias),
          operation: "LINK",
          ...target,
          contactId: existing.id,
          confirmed: "true",
        }),
      { timeout: 30000 },
    );
    const linked = await prisma.locationContact.findUniqueOrThrow({
      where: { id: existing.id },
    });
    assert.equal(linked.email, existing.email);
    assert.ok(linked.emailAliases.includes(addresses.alias));
    await prisma.$transaction(
      (tx) =>
        reviewContactSuggestion(tx, actor, {
          key: suggestionKey("EMAIL", addresses.dismiss),
          operation: "DISMISS",
        }),
      { timeout: 30000 },
    );
    assert.ok(
      !(await loadContactSuggestions(prisma, actor)).suggestions.some(
        (s) => s.value === addresses.dismiss,
      ),
    );
    await prisma.accountActivity.deleteMany({
      where: {
        organizationId: f.orgA,
        connectionId: connection.id,
        participants: { has: addresses.stale },
      },
    });
    await assert.rejects(
      () =>
        prisma.$transaction((tx) =>
          reviewContactSuggestion(tx, actor, {
            key: suggestionKey("EMAIL", addresses.stale),
            operation: "CREATE",
            ...target,
            name: "Stale",
            confirmed: "true",
          }),
        ),
      /no longer available/,
    );
    const sms = await prisma.smsConnection.findFirstOrThrow({
        where: { organizationId: f.orgA, provider: "MOCK" },
      }),
      phone = `+1202${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    await prisma.$transaction((tx) =>
      receiveSms(tx, sms, {
        MessageSid: id,
        From: phone,
        Body: "Please contact our beverage buyer.",
      }),
    );
    const smsSuggestion = (
      await loadContactSuggestions(prisma, actor)
    ).suggestions.find((s) => s.value === phone)!;
    assert.ok(smsSuggestion);
    assert.ok(
      (await loadContactSuggestions(prisma, peer)).suggestions.some(
        (s) => s.value === phone,
      ),
    );
    const savedSms = await prisma.$transaction(
      (tx) =>
        reviewContactSuggestion(tx, actor, {
          key: smsSuggestion.key,
          operation: "CREATE",
          ...target,
          name: "SMS Fixture Buyer",
          confirmed: "true",
        }),
      { timeout: 30000 },
    );
    assert.ok(savedSms.contactId);
    assert.equal(
      await prisma.smsConsent.count({
        where: { organizationId: f.orgA, phone, status: "OPTED_IN" },
      }),
      0,
    );
    assert.equal(
      await prisma.loggedVisit.count({
        where: { organizationId: f.orgA, contactId: savedSms.contactId! },
      }),
      0,
    );
    const audit = await prisma.organizationAuditEvent.findMany({
      where: {
        organizationId: f.orgA,
        metadata: { path: ["kind"], equals: "CONTACT_SUGGESTION_ACCEPTED" },
      },
    });
    assert.ok(!JSON.stringify(audit).includes("Private fixture"));
    writeFileSync(
      "output/contact-suggestions-fixture.json",
      JSON.stringify({
        account,
        addresses,
        connectionId: connection.id,
        existingContactId: existing.id,
      }),
      "utf8",
    );
    console.log(
      "PASS: tenant/member/private isolation, header names, internal suppression, two-way priority, review gate, concurrent acceptance/replay, alias preservation, durable dismissal, stale-source rejection, SMS capture without consent/visits, private evidence association and sanitized audit.",
    );
  });
}
main().finally(() => prisma.$disconnect());
