import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  extractEmails,
  matchParticipants,
  isInternalMessage,
} from "../lib/crm/matching";
import {
  manualActivityInput,
  visibleActivityWhere,
  logActivity,
  correctActivity,
  timelineCursorWhere,
  type CrmDb,
} from "../lib/crm/activity";
import { relationshipIndicators } from "../lib/crm/briefing";
import {
  dealForecast,
  moveDeal,
  revenueCentsFromInput,
} from "../lib/crm/deals";
const actor = { organizationId: "tenant-a", userId: "rep-a" };
test("USD input preserves zero and cents and rejects precision loss and overflow", () => {
  assert.equal(revenueCentsFromInput(""), undefined);
  assert.equal(revenueCentsFromInput("0"), 0);
  assert.equal(revenueCentsFromInput("19.99"), 1999);
  assert.equal(revenueCentsFromInput("20000000"), 2000000000);
  for (const value of ["-1", "1.999", "NaN", "1e6", "20000001", 100])
    assert.throws(() => revenueCentsFromInput(value));
});
test("timeline cursors retain equal-time records across source boundaries", () => {
  const before = new Date("2026-10-10T12:00:00Z");
  assert.deepEqual(
    timelineCursorWhere("occurredAt", "activity:", before, "activity:c2"),
    {
      OR: [
        { occurredAt: { lt: before } },
        { occurredAt: before, id: { lt: "c2" } },
      ],
    },
  );
  assert.deepEqual(
    timelineCursorWhere("occurredAt", "activity:", before, "visit:c1"),
    {
      OR: [{ occurredAt: { lt: before } }, { occurredAt: before }],
    },
  );
  assert.deepEqual(
    timelineCursorWhere("visitAt", "visit:", before, "activity:c2"),
    {
      OR: [{ visitAt: { lt: before } }],
    },
  );
});
test("exact contact email matching never assigns an account based on domain alone", () => {
  const contacts = [
    {
      id: "one",
      email: "Buyer@Example.com",
      agencyId: null,
      wholesaleAccountId: "account-a",
    },
  ];
  assert.equal(
    matchParticipants(["buyer@example.com"], contacts).wholesaleAccountId,
    "account-a",
  );
  assert.equal(
    matchParticipants(["other@example.com"], contacts).status,
    "REVIEW",
  );
  assert.equal(
    matchParticipants(
      ["buyer@example.com"],
      [
        ...contacts,
        { ...contacts[0], id: "two", wholesaleAccountId: "account-b" },
      ],
    ).status,
    "REVIEW",
  );
});
test("multiple exact contacts at one account preserve account association without guessing the contact", () => {
  const result = matchParticipants(
    ["a@x.com", "b@x.com"],
    ["a", "b"].map((id) => ({
      id,
      email: `${id}@x.com`,
      agencyId: "agency",
      wholesaleAccountId: null,
    })),
  );
  assert.equal(result.agencyId, "agency");
  assert.equal(result.contactId, null);
});
test("email normalization preserves aliases; internal exclusion requires every participant to be internal", () => {
  assert.deepEqual(
    extractEmails("Buyer <BUYER+VIP@Example.com>, other@example.org"),
    ["buyer+vip@example.com", "other@example.org"],
  );
  assert.equal(
    isInternalMessage(
      ["rep@example.com", "boss@example.com"],
      ["boss@example.com"],
      "rep@example.com",
    ),
    true,
  );
  assert.equal(
    isInternalMessage(
      ["buyer@example.com"],
      ["boss@example.com"],
      "rep@example.com",
    ),
    false,
  );
});
test("privacy predicates always include tenant and never grant admin-wide private access", () => {
  assert.deepEqual(visibleActivityWhere(actor), {
    organizationId: "tenant-a",
    OR: [{ visibility: "TEAM" }, { createdByUserId: "rep-a" }],
  });
});
test("manual logging validates future dates, tenant contact, and stable deduplication keys", async () => {
  const input = {
    accountType: "WHOLESALE",
    accountId: "account",
    activityType: "EMAIL",
    summary: "Buyer confirmed next week",
    occurredAt: new Date("2026-10-01"),
    submissionKey: randomUUID(),
    contactId: "foreign",
  };
  let saved = false;
  const db = {
    wholesaleAccount: { findFirst: async () => ({ id: "account" }) },
    locationContact: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.organizationId, actor.organizationId);
        return null;
      },
    },
    accountActivity: {
      upsert: async () => {
        saved = true;
      },
    },
  } as unknown as CrmDb;
  await assert.rejects(() => logActivity(db, actor, input), /active contact/);
  assert.equal(saved, false);
  await assert.rejects(
    () =>
      logActivity(db, actor, { ...input, occurredAt: new Date("2030-01-01") }),
    /past or current/,
  );
  assert.equal(
    manualActivityInput.safeParse({ ...input, activityType: "PHYSICAL_VISIT" })
      .success,
    false,
  );
});
test("correction rejects a foreign or other-owner activity before account lookups or writes", async () => {
  const db = {
    accountActivity: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.organizationId, actor.organizationId);
        assert.equal(where.createdByUserId, actor.userId);
        return null;
      },
    },
  } as unknown as CrmDb;
  await assert.rejects(
    () =>
      correctActivity(db, actor, {
        id: "foreign",
        accountType: "AGENCY",
        accountId: "x",
        visibility: "TEAM",
      }),
    /not owned/,
  );
});
test("relationship guidance treats missing evidence as unknown and explains overdue commitments", () => {
  const base = {
    now: new Date("2026-10-10"),
    lastMeaningful: null,
    lastVisit: null,
    overdue: 0,
    contacts: 1,
  };
  assert.equal(
    relationshipIndicators(base).status,
    "Insufficient relationship evidence",
  );
  assert.equal(
    relationshipIndicators({ ...base, overdue: 2 }).nextAction,
    "Review overdue Worklist commitments",
  );
  assert.match(
    relationshipIndicators({ ...base, lastMeaningful: new Date("2026-08-01") })
      .reasons[0],
    /70 days/,
  );
});
test("forecast excludes paused and closed deals and counts absent revenue separately from zero", () => {
  assert.deepEqual(
    dealForecast([
      { status: "OPEN", revenueCents: 10000, probability: 25 },
      { status: "OPEN", revenueCents: null, probability: 90 },
      { status: "OPEN", revenueCents: 0, probability: 100 },
      { status: "WON", revenueCents: 99999, probability: 100 },
    ]),
    { openCount: 3, unvalued: 1, totalCents: 10000, weightedCents: 2500 },
  );
});
test("deal transitions reject stale versions without writing stage history", async () => {
  let events = 0;
  const db = {
    deal: {
      findFirst: async () => ({ id: "deal", stageId: "one", status: "OPEN" }),
      updateMany: async () => ({ count: 0 }),
    },
    dealStage: { findFirst: async () => ({ id: "two", probability: 30 }) },
    dealEvent: {
      create: async () => {
        events++;
      },
    },
  } as unknown as CrmDb;
  await assert.rejects(
    () =>
      moveDeal(db, actor, {
        id: "deal",
        version: 1,
        stageId: "two",
        status: "OPEN",
      }),
    /changed/,
  );
  assert.equal(events, 0);
  await assert.rejects(
    () =>
      moveDeal(db, actor, {
        id: "deal",
        version: 1,
        stageId: "two",
        status: "LOST",
      }),
    /Explain/,
  );
});
