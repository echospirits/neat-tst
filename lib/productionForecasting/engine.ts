import {
  type BacktestScore, type Confidence, type DemandSeries, type ForecastBucket, type ForecastConfig,
  type ForecastProduct, type GuidanceObservation, type LocationForecast, type Method, type ProductForecast,
  type Signals, clamp, completeSum, dayCount, days, forecastRules, includedInDemand, mean, methods,
  percentChange, previousYear, priorYearDays, rounded, shift, sum,
} from './model';

/** Only source-covered dates are zeros. Unknown dates remain absent. Availability
 * is source posting time, independent of the later receipt/import timestamp. */
export function valuesKnownAt(series: DemandSeries, origin: string) {
  const values = new Map<string, number>();
  for (const coverage of series.coverage) for (const date of days(coverage.start, coverage.end < origin ? coverage.end : origin)) values.set(date, 0);
  for (const row of series.observations) if (row.date <= origin && row.availableOn <= origin && includedInDemand(row.classification) && values.has(row.date)) values.set(row.date, (values.get(row.date) ?? 0) + row.cases);
  return values;
}
const window = (values: Map<string, number>, end: string, count: number) => days(shift(end, 1 - count), end).map(d => values.get(d) ?? null);
const total = (values: Map<string, number>, end: string, count: number) => completeSum(window(values, end, count));
function tail(values: Map<string, number>, origin: string, limit = 90) {
  const result: number[] = [];
  for (let i = 0; i < limit; i++) { const value = values.get(shift(origin, -i)); if (value === undefined) break; result.unshift(value); }
  return result;
}
export function signalsFor(values: Map<string, number>, origin: string, start: string): Signals {
  const recent = tail(values, origin, forecastRules.maxHistoryDays);
  const priorDates = priorYearDays(start, 30);
  const current90 = total(values, origin, 90);
  const prior90 = completeSum(priorYearDays(shift(origin, -89), 90).map(d => values.get(d) ?? null));
  const weekly = Array.from({ length: Math.floor(Math.min(90, recent.length) / 7) }, (_, i) => sum(recent.slice(recent.length - (i + 1) * 7, recent.length - i * 7)));
  const weeklyMean = mean(weekly);
  return {
    trailing30: total(values, origin, 30), trailing60: total(values, origin, 60), trailing90: current90,
    priorYear: completeSum(priorDates.map(d => values.get(d) ?? null)),
    yoy: percentChange(current90, prior90),
    recentTrend: percentChange(total(values, origin, 30), total(values, shift(origin, -30), 30)),
    longTrend: percentChange(current90, total(values, shift(origin, -90), 90)),
    volatility: weekly.length >= 4 && weeklyMean > 0 ? Math.sqrt(mean(weekly.map(n => (n - weeklyMean) ** 2))) / weeklyMean : null,
    historyDays: recent.length, nonzeroDays: recent.filter(n => n > 0).length,
  };
}

/** All fitted parameters are derived from the supplied training map only. */
export function predict(method: Method, values: Map<string, number>, origin: string, start: string, horizon = 30, config: ForecastConfig = forecastRules): number[] | null {
  const recent = tail(values, origin);
  if (recent.length < config.minimumDays) return null;
  const average = mean(recent), last30 = mean(recent.slice(-30));
  let daily: number;
  if (method === 'recent-mean') daily = average;
  else if (method === 'weighted-mean') daily = (last30 * 0.5 + mean(recent.slice(-60)) * 0.3 + average * 0.2);
  else if (method === 'exponential-smoothing') { daily = mean(recent.slice(0, Math.min(14, recent.length))); for (const value of recent) daily = 0.12 * value + 0.88 * daily; }
  else if (method === 'croston-sba') {
    if (recent.length < 30 || recent.filter(n => n > 0).length / recent.length > 0.35) return null;
    const alpha = 0.1; let size = 0, interval = 0, elapsed = 1;
    for (const value of recent) {
      if (value > 0) { size = size ? alpha * value + (1 - alpha) * size : value; interval = interval ? alpha * elapsed + (1 - alpha) * interval : elapsed; elapsed = 1; }
      else elapsed++;
    }
    daily = interval ? (1 - alpha / 2) * size / interval : 0;
  } else {
    const previous = priorYearDays(start, horizon).map(d => values.get(d));
    if (previous.some(v => v === undefined) || recent.length < 30) return null;
    // Smooth prior-year daily lumps within each 7-day horizon bucket. Seasonal
    // shape remains across the horizon; one shipment day does not drive a spike.
    const seasonal = previous as number[];
    if (method === 'seasonal-naive') return seasonal.map(n => Math.max(0, n));
    const s = signalsFor(values, origin, start);
    const ratio = clamp(1 + (s.yoy ?? 0), config.growthMinimum, config.growthMaximum);
    const longRatio = clamp(1 + (s.longTrend ?? 0), 0.8, 1.25);
    const growth = 1 + 0.5 * (ratio - 1) + 0.2 * (longRatio - 1);
    const result: number[] = [];
    for (let i = 0; i < horizon; i += 7) {
      const slice = seasonal.slice(i, i + 7);
      const rate = mean(slice) * growth * 0.7 + (last30 * 0.6 + average * 0.4) * 0.3;
      result.push(...slice.map(() => Math.max(0, rate)));
    }
    return result;
  }
  return Array.from({ length: horizon }, () => Math.max(0, daily));
}

export function scoreFolds(method: Method, folds: BacktestScore['folds']): BacktestScore {
  const errorTotal = sum(folds.map(f => Math.abs(f.error))), actualTotal = sum(folds.map(f => Math.abs(f.actual)));
  const scaled = folds.filter(f => f.scale !== null && f.scale > 0).map(f => Math.abs(f.error) / 30 / f.scale!);
  return { method, folds, mae: folds.length ? errorTotal / folds.length : null, wape: actualTotal > 0 ? errorTotal / actualTotal : null,
    mase: scaled.length ? mean(scaled) : null, bias: actualTotal > 0 ? sum(folds.map(f => f.predicted - f.actual)) / actualTotal : null };
}
export function backtest(series: DemandSeries, origin: string, config: ForecastConfig = forecastRules): BacktestScore[] {
  const actualValues = valuesKnownAt(series, origin);
  const folds = new Map<Method, BacktestScore['folds']>(methods.map(m => [m, []]));
  for (let i = config.backtestFolds; i >= 1; i--) {
    const cutoff = shift(origin, -i * config.backtestStepDays);
    const training = valuesKnownAt(series, cutoff);
    const actual = total(actualValues, shift(cutoff, 30), 30);
    const recent = tail(training, cutoff);
    if (actual === null || recent.length < config.minimumBacktestDays) continue;
    const differences = recent.slice(1).map((v, j) => Math.abs(v - recent[j]));
    const scale = mean(differences) || null;
    for (const method of methods) {
      const prediction = predict(method, training, cutoff, shift(cutoff, 1), 30, config);
      if (prediction) { const predicted = sum(prediction); folds.get(method)!.push({ origin: cutoff, predicted, actual, error: actual - predicted, scale }); }
    }
  }
  return methods.map(method => scoreFolds(method, folds.get(method)!));
}
export function selectModel(scores: BacktestScore[], eligible: Method[]) {
  // Compare every candidate on the same origins. A seasonal candidate with one
  // lucky fold cannot beat a baseline evaluated on eight harder folds.
  const usable = scores.filter(s => eligible.includes(s.method) && s.folds.length >= 3);
  const origins = usable.length ? usable.reduce((set, score) => new Set([...set].filter(o => score.folds.some(f => f.origin === o))), new Set(usable[0].folds.map(f => f.origin))) : new Set<string>();
  if (origins.size < 3) return eligible.includes('weighted-mean') ? 'weighted-mean' : eligible[0] ?? 'recent-mean';
  return usable.map(s => scoreFolds(s.method, s.folds.filter(f => origins.has(f.origin)))).sort((a, b) => a.mae! - b.mae! || methods.indexOf(a.method) - methods.indexOf(b.method))[0].method;
}
export function bucketsFor(prediction: number[], start: string): ForecastBucket[] {
  const buckets = [0, 7, 14, 21, 28].map((offset, i) => ({ label: i < 4 ? `Week ${i + 1}` : 'Remaining 2 days', start: shift(start, offset), end: shift(start, Math.min(offset + 6, 29)), cases: rounded(sum(prediction.slice(offset, Math.min(offset + 7, 30)))) }));
  buckets[4].cases = rounded(rounded(sum(prediction)) - sum(buckets.slice(0, 4).map(b => b.cases)));
  return buckets;
}
const percent = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
export function forecastLocation(series: DemandSeries, asOf: string, config: ForecastConfig = forecastRules): LocationForecast {
  const start = shift(asOf, 1);
  const values = valuesKnownAt(series, asOf);
  const through = [...values.keys()].sort().at(-1) ?? null;
  const signals = signalsFor(values, through ?? asOf, start);
  const base: LocationForecast = { location: series.location, dataThrough: through, point: null, lower: null, upper: null, confidence: 'Low', method: null, rangeMethod: 'Unavailable', buckets: [], signals, backtests: [], reasons: [] };
  if (!through || dayCount(through, asOf) - 1 > config.maxStaleDays || signals.historyDays < config.minimumDays) {
    base.reasons.push(!through ? 'No complete outbound case history.' : signals.historyDays < config.minimumDays ? `Only ${signals.historyDays} consecutive covered days; at least ${config.minimumDays} are needed.` : `Source is stale: data through ${through}.`); return base;
  }
  const eligible = methods.filter(m => predict(m, values, through, start, 30, config) !== null);
  const scores = backtest(series, through, config);
  const method = selectModel(scores, eligible);
  const daily = predict(method, values, through, start, 30, config)!;
  const point = sum(daily), score = scores.find(s => s.method === method)!;
  const errors = score.folds.map(f => Math.abs(f.error)).sort((a, b) => a - b);
  const stability = scores.find(s => s.method === 'weighted-mean')?.folds.slice(-3).map(f => f.predicted) ?? [];
  const stable = stability.length >= 3 && Math.max(...stability) <= Math.max(1, Math.min(...stability)) * 1.5;
  const confidence: Confidence = signals.historyDays >= 365 && score.folds.length >= 6 && score.wape !== null && score.wape <= 0.2 && (signals.volatility ?? 2) <= 0.7 && stable && through === asOf ? 'High' : signals.historyDays >= 90 && score.folds.length >= 3 && score.wape !== null && score.wape <= 0.5 && (signals.volatility ?? 3) <= 1.5 && through === asOf ? 'Medium' : 'Low';
  // Empirical 80th percentile absolute 30-day error. Sparse histories receive
  // a labelled planning range, not a fabricated calibrated probability interval.
  const empirical = errors.length >= 3;
  const radius = empirical ? errors[Math.min(errors.length - 1, Math.ceil(config.rangeQuantile * errors.length) - 1)] : Math.max(point * 0.5, Math.sqrt(sum(tail(values, through).map(n => n * n)) / Math.max(1, tail(values, through).length) * 30));
  const reasons = [`${signals.historyDays} consecutive covered days; ${score.folds.length} rolling 30-day backtests.`, `Selected ${method.replaceAll('-', ' ')} using historical forecast error.`];
  if (signals.priorYear !== null) reasons.push(`Comparable period last year: ${rounded(signals.priorYear)} cases.`);
  if (signals.yoy !== null) reasons.push(`Trailing 90-day demand is ${percent(signals.yoy)} year over year; growth is damped and capped in the seasonal model.`);
  if (signals.recentTrend !== null) reasons.push(`Recent 30-day demand is ${percent(signals.recentTrend)} versus the preceding 30 days.`);
  if (signals.longTrend !== null) reasons.push(`Longer-term 90-day demand is ${percent(signals.longTrend)} versus the preceding 90 days.`);
  if (signals.volatility !== null) reasons.push(`Weekly demand volatility is ${signals.volatility > 1 ? 'high' : signals.volatility > 0.5 ? 'moderate' : 'low'}.`);
  if (!empirical) reasons.push('Limited backtest history: range is an uncalibrated planning band.');
  if (through < asOf) reasons.push(`Recent source gap: data through ${through}; confidence reduced.`);
  return { ...base, point: rounded(point), lower: rounded(Math.max(0, point - radius)), upper: rounded(point + radius), confidence, method, rangeMethod: empirical ? 'Empirical 80th percentile absolute 30-day backtest error; not a guaranteed probability interval' : 'Uncalibrated sparse-history planning band', buckets: bucketsFor(daily, start), backtests: scores, reasons };
}

export function forecastProduct(product: ForecastProduct, series: DemandSeries[], guidance: GuidanceObservation[], asOf: string, previous: ProductForecast | null = null, config: ForecastConfig = forecastRules): ProductForecast {
  const selected = product.demandExcluded ? [] : series.filter(s => s.market === product.market && s.itemCode === product.code && includedInDemand(s.classification ?? 'BAILMENT'));
  // Guidance can establish a location's existence, never its demand quantity.
  // A known location without outbound coverage must not disappear from totals.
  if (!product.demandExcluded) for (const g of guidance.filter(g => g.market === product.market && g.itemCode === product.code && g.date <= shift(asOf, 1) && includedInDemand(g.classification))) {
    if (!selected.some(s => s.location.code === g.location.code)) selected.push({ market: product.market, itemCode: product.code, location: g.location, classification: g.classification, observations: [], coverage: [] });
  }
  const locations = selected.map(s => forecastLocation(s, asOf, config));
  const point = completeSum(locations.map(l => l.point));
  const rank = { Low: 0, Medium: 1, High: 2 };
  const confidence: Confidence = locations.length ? locations.reduce((a, b) => rank[a] < rank[b.confidence] ? a : b.confidence, 'High' as Confidence) : 'Low';
  const safetyFactor = config.safety[confidence];
  const currentGuidance = product.demandExcluded ? [] : guidance.filter(g => g.market === product.market && g.itemCode === product.code && g.date <= shift(asOf, 1) && includedInDemand(g.classification));
  const alerts: string[] = [], reasons: string[] = [];
  const change = percentChange(point, previous?.point ?? null);
  if (change !== null && Math.abs(change) >= config.materialChangePercent && Math.abs(point! - previous!.point!) >= config.materialChangeCases) alerts.push('Forecast changed');
  if (locations.some(l => l.signals.recentTrend !== null && l.signals.recentTrend >= config.unusualRatio - 1 && (l.signals.trailing30 ?? 0) >= config.materialChangeCases)) alerts.push('Unusual demand');
  if (currentGuidance.some(g => {
    const old = previous?.guidance.find(p => p.location.code === g.location.code);
    return old && g.date > old.date && ([['minimum', g.minimum, old.minimum], ['maximum', g.maximum, old.maximum]] as const).some(([, n, p]) => n !== null && p !== null && Math.abs(n - p) >= config.guidanceChangeCases && Math.abs(percentChange(n, p) ?? 0) >= config.guidanceChangePercent);
  })) alerts.push('Guidance divergence');
  if (!selected.length) reasons.push(product.demandExcluded ? 'Distillery Only / A-3a Dist item: excluded from production demand forecasting.' : 'Outbound case history is unavailable for this product. Import a verified complete Bailment PO / Invoice slice.');
  else if (point === null) reasons.push('A location has missing, sparse or stale history. The product total is unavailable until every known location can be forecast.');
  reasons.push('Forecast is expected outbound demand. Planning target adds the configured uncertainty margin; finished inventory has not been subtracted.', 'Distribution Center min/max values are contextual guidance and do not replace historical demand.');
  const combined = selected.map(s => valuesKnownAt(s, asOf));
  const start = shift(asOf, 1), end = shift(start, 29);
  const history = Array.from({ length: 13 }, (_, i) => {
    const bucketEnd = shift(asOf, -(12 - i) * 30), bucketStart = shift(bucketEnd, -29);
    return { start: bucketStart, end: bucketEnd, actual: completeSum(combined.map(v => total(v, bucketEnd, 30))), priorYear: completeSum(combined.map(v => completeSum(priorYearDays(bucketStart, 30).map(d => v.get(d) ?? null)))) };
  });
  const priorYear = completeSum(locations.map(l => l.signals.priorYear));
  const trailing90 = completeSum(locations.map(l => l.signals.trailing90));
  const prior90 = completeSum(combined.map(v => completeSum(priorYearDays(shift(asOf, -89), 90).map(d => v.get(d) ?? null))));
  const recent30 = completeSum(locations.map(l => l.signals.trailing30));
  const previous30 = completeSum(combined.map(v => total(v, shift(asOf, -30), 30)));
  if (point !== null) reasons.unshift(`Expected demand sums ${locations.length} independently backtested location forecasts.`, ...(priorYear !== null ? [`Comparable 30-day period last year: ${rounded(priorYear)} cases.`] : []), ...(percentChange(trailing90, prior90) !== null ? [`Trailing 90-day demand is ${percent(percentChange(trailing90, prior90)!)} year over year.`] : []), ...(percentChange(recent30, previous30) !== null ? [`Recent 30-day demand is ${percent(percentChange(recent30, previous30)!)} versus the preceding period.`] : []));
  return { product, start, end, locations, point, lower: completeSum(locations.map(l => l.lower)), upper: completeSum(locations.map(l => l.upper)), target: point === null ? null : Math.ceil(point * (1 + safetyFactor)), safetyFactor, confidence,
    priorYear, yoy: percentChange(trailing90, prior90), recentTrend: percentChange(recent30, previous30), change, alerts, reasons, guidance: currentGuidance,
    dataThrough: locations.length && locations.every(l => l.dataThrough) ? locations.map(l => l.dataThrough!).sort()[0] : null,
    buckets: point === null ? [] : locations[0].buckets.map((b, i) => ({ ...b, cases: rounded(sum(locations.map(l => l.buckets[i].cases))) })), history };
}
