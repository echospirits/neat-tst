import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  manualActivityInput,
  visibleActivityWhere,
  logActivity,
  correctActivity,
  timelineCursorWhere,
  type CrmDb,
} from "../lib/crm/activity";
import { relationshipIndicators } from "../lib/crm/briefing";
import { pipelineForecast, salesPlanInput, saveSalesPlan } from '../lib/crm/pipeline';
const actor = { organizationId: 'tenant-a', userId: 'rep-a' };
test('pipeline estimates distinguish empty amounts from zero and reject invalid values', () => {
  const base = { accountType: 'AGENCY', accountId: 'one', version: 0 };
  assert.equal(salesPlanInput.parse({ ...base, estimatedRevenue: '' }).estimatedRevenue, null);
  assert.equal(salesPlanInput.parse({ ...base, estimatedRevenue: '0' }).estimatedRevenue, 0);
  for (const value of [-1, 20000001, 'bad', Infinity]) assert.equal(salesPlanInput.safeParse({ ...base, estimatedRevenue: value }).success, false);
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
test('forecast uses canonical statuses and excludes purchasing, nurture and lost accounts', () => {
  assert.deepEqual(pipelineForecast([
    { salesStatus: 'CONTACTED', salesPlan: { estimatedRevenue: 100, probability: 25 } },
    { salesStatus: 'ENGAGED', salesPlan: {} },
    { salesStatus: 'INTERESTED', salesPlan: { estimatedRevenue: 0, probability: 100 } },
    { salesStatus: 'PURCHASING', salesPlan: { estimatedRevenue: 99999, probability: 100 } },
  ]), { accounts: 3, valued: 2, weighted: 25, unweighted: 100, missingProbability: 0 });
});
test('stale account plans cannot overwrite newer plans or create audit entries', async () => {
  const db = { agency: { findUnique: async () => ({ id: 'one' }) }, $executeRaw: async () => 1, organizationAccountOverlay: { findUnique: async () => ({ salesPlanVersion: 2 }) } } as unknown as CrmDb;
  await assert.rejects(() => saveSalesPlan(db, actor, { accountType: 'AGENCY', accountId: 'one', version: 1 }), /changed/);
});
