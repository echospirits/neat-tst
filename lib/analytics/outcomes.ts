import {
  comparisonRange,
  coverageFor,
  daysBetween,
  inRange,
  shiftDay,
  type AnalyticsData,
  type Filters,
} from "./model";
/** Purchase-day observations, never transaction/order counts or causal attribution. */
export function purchaseOutcomes(data: AnalyticsData, f: Filters) {
  const allowed = new Set(
    data.products
      .filter(
        (p) =>
          (f.market === "all" || p.market === f.market) &&
          (!f.product || p.key === f.product),
      )
      .map((p) => p.key),
  );
  const accounts = data.accounts.filter(
    (a) =>
      a.matched &&
      (f.market === "all" || a.market === f.market) &&
      (f.channel === "all" || a.channel === f.channel),
  );
  const prior = comparisonRange(f);
  let cohort = 0,
    repeated = 0,
    pending = 0,
    recovered = 0,
    adoptions = 0,
    positiveBottles = 0,
    purchaseDays = 0,
    intervalDays = 0,
    intervals = 0,
    priorBuyers = 0,
    retained = 0,
    coveredAccounts = 0;
  const byAccount = new Map<string, typeof data.sales>();
  for (const s of data.sales)
    if (allowed.has(s.product) && s.quantity > 0 && s.date <= f.end) {
      const rows = byAccount.get(s.account) ?? [];
      rows.push(s);
      byAccount.set(s.account, rows);
    }
  for (const a of accounts) {
    const coverage = data.coverage.filter(
      (c) => c.market === a.market && c.channel === a.channel,
    );
    if (!allowed.size || !coverageFor(coverage, f).complete) continue;
    coveredAccounts++;
    const rows = (byAccount.get(a.key) ?? []).sort((x, y) =>
      x.date.localeCompare(y.date),
    );
    const dates = [...new Set(rows.map((s) => s.date))],
      selected = dates.filter((d) => inRange(d, f));
    positiveBottles += rows
      .filter((s) => inRange(s.date, f))
      .reduce((n, s) => n + s.quantity, 0);
    purchaseDays += selected.length;
    for (let i = 1; i < dates.length; i++)
      if (
        inRange(dates[i], f) &&
        coverageFor(coverage, { start: dates[i - 1], end: dates[i] }).complete
      ) {
        intervals++;
        intervalDays += daysBetween(dates[i - 1], dates[i]);
        if (daysBetween(dates[i - 1], dates[i]) > 30) recovered++;
      }
    if (dates[0] && inRange(dates[0], f)) {
      const end = shiftDay(dates[0], 30);
      if (
        end <= f.end &&
        coverageFor(coverage, { start: dates[0], end }).complete
      ) {
        cohort++;
        if (dates[1] && dates[1] <= end) repeated++;
      } else pending++;
    }
    for (const product of new Set(rows.map((r) => r.product))) {
      const first = rows.find((r) => r.product === product)!;
      if (inRange(first.date, f)) adoptions++;
    }
    if (
      prior &&
      coverageFor(coverage, prior).complete &&
      dates.some((d) => inRange(d, prior))
    ) {
      priorBuyers++;
      if (selected.length) retained++;
    }
  }
  return {
    coveredAccounts,
    cohort,
    repeated,
    pending,
    recovered,
    adoptions,
    averagePositiveBottlesPerPurchaseDay: purchaseDays
      ? positiveBottles / purchaseDays
      : null,
    meanObservedCadenceDays: intervals ? intervalDays / intervals : null,
    priorBuyers,
    retained,
    retentionPercent: priorBuyers ? (100 * retained) / priorBuyers : null,
  };
}
