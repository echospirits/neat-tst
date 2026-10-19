import test from "node:test";
import assert from "node:assert/strict";
import { purchaseOutcomes } from "../lib/analytics/outcomes";
import {
  dates,
  type AnalyticsData,
  type Filters,
} from "../lib/analytics/model";
const f: Filters = {
  start: "2026-09-01",
  end: "2026-10-10",
  market: "OH",
  channel: "wholesale",
  product: "",
  comparison: "none",
  preset: "custom",
  view: "overview",
  group: "all",
  q: "",
  sort: "quantity",
  page: 1,
};
const data: AnalyticsData = {
  products: [{ key: "p", market: "OH", code: "p", name: "P" }],
  accounts: [
    {
      key: "a",
      name: "A",
      city: null,
      channel: "wholesale",
      market: "OH",
      href: "/a",
      matched: true,
    },
  ],
  sales: ["2026-09-01", "2026-09-01", "2026-09-20", "2026-10-09"].map(
    (date) => ({
      account: "a",
      product: "p",
      date,
      channel: "wholesale",
      market: "OH",
      quantity: 5,
    }),
  ),
  coverage: [
    {
      market: "OH",
      channel: "wholesale",
      source: "fixture",
      unit: "bottles",
      days: dates(f),
    },
  ],
  activity: [],
  openWork: {},
  warnings: [],
};
test("continuity deduplicates purchase days and never treats partial coverage as failure to repeat", () => {
  const r = purchaseOutcomes(data, f);
  assert.equal(r.cohort, 1);
  assert.equal(r.repeated, 1);
  assert.equal(r.meanObservedCadenceDays, 19);
  assert.equal(r.averagePositiveBottlesPerPurchaseDay, 20 / 3);
  const gap = purchaseOutcomes(
    { ...data, coverage: [{ ...data.coverage[0], days: [] }] },
    f,
  );
  assert.equal(gap.coveredAccounts, 0);
  assert.equal(gap.averagePositiveBottlesPerPurchaseDay, null);
});
test("short observation windows remain pending, and foreign products are not counted", () => {
  const r = purchaseOutcomes(data, { ...f, end: "2026-09-10" });
  assert.equal(r.cohort, 0);
  assert.equal(r.pending, 1);
  assert.equal(
    purchaseOutcomes(data, { ...f, product: "foreign" }).coveredAccounts,
    0,
  );
});
