import test from "node:test";
import assert from "node:assert/strict";
import {
  accountHealth,
  healthRules,
  healthRulesInput,
} from "../lib/crm/health";
import { contactProfileInput, relateContacts } from "../lib/crm/contacts";
import { matchParticipants, isInternalMessage } from "../lib/crm/matching";
import { safeOriginalUrl } from "../lib/crm/mail/sync";
import type { CrmDb } from "../lib/crm/activity";
test("health keeps missing purchasing evidence unknown and explains different account intervals", () => {
  const input = {
    kind: "AGENCY" as const,
    now: new Date("2026-10-11"),
    lastMeaningful: new Date("2026-09-15"),
    lastPurchase: new Date("2026-09-20"),
    overdue: 2,
    contacts: 1,
    rules: healthRules({}),
  };
  assert.equal(accountHealth(input).score, 55);
  assert.equal(accountHealth({ ...input, kind: "CHAIN" }).score, 80);
  assert.equal(accountHealth({ ...input, lastPurchase: null }).score, null);
  assert.equal(
    healthRulesInput.safeParse({ agencyContactDays: 0 }).success,
    false,
  );
});
test("known aliases match exactly but never justify ambiguous account assignment", () => {
  const contact = {
    id: "one",
    email: "primary@example.com",
    emailAliases: ["alias@example.com"],
    agencyId: "one",
    wholesaleAccountId: null,
  };
  assert.equal(
    matchParticipants(["alias@example.com"], [contact]).contactId,
    "one",
  );
  assert.equal(
    matchParticipants(
      ["alias@example.com"],
      [contact, { ...contact, id: "two", agencyId: "two" }],
    ).status,
    "REVIEW",
  );
  assert.equal(
    isInternalMessage(
      ["a@company.com", "buyer@external.com"],
      [],
      "rep@company.com",
      ["company.com"],
    ),
    false,
  );
  assert.equal(
    isInternalMessage(["a@company.com"], [], "rep@company.com", [
      "company.com",
    ]),
    true,
  );
});
test("relationship profile validates aliases and controlled preference values", () => {
  assert.deepEqual(
    contactProfileInput.parse({
      emailAliases: "Buyer@EXAMPLE.com, alias@example.com",
    }).emailAliases,
    ["buyer@example.com", "alias@example.com"],
  );
  assert.equal(
    contactProfileInput.safeParse({ emailAliases: "not-email" }).success,
    false,
  );
  assert.equal(
    contactProfileInput.safeParse({ decisionAuthority: "ROOT" }).success,
    false,
  );
});
test("contact links reject cross-tenant rows and cross-account merges before mutation", async () => {
  const actor = { organizationId: "a", userId: "u" };
  const db = {
    $executeRaw: async () => 1,
    locationContact: {
      findMany: async ({ where }: { where: { organizationId: string } }) => {
        assert.equal(where.organizationId, "a");
        return [
          { id: "a", agencyId: "one" },
          { id: "b", agencyId: "two" },
        ];
      },
    },
  } as unknown as CrmDb;
  await assert.rejects(
    () =>
      relateContacts(db, actor, {
        id: "a",
        otherId: "foreign",
        operation: "LINK",
      }),
    /organization/,
  );
  await assert.rejects(
    () =>
      relateContacts(db, actor, { id: "a", otherId: "b", operation: "MERGE" }),
    /different accounts/,
  );
});
test("original message links reject credential, protocol and host attacks", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://evil.example/x",
    "https://mail.google.com.evil.example",
    "https://user:secret@mail.google.com/x",
  ])
    assert.equal(safeOriginalUrl(value), null);
  assert.equal(
    safeOriginalUrl("https://outlook.office.com/mail/id/a"),
    "https://outlook.office.com/mail/id/a",
  );
});
