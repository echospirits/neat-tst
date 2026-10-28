import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { formatDateInputValue } from '../dateTime';
import { forecastAccess, type SourceScope } from './import';
import { ohioItemContext } from './ohio';
import { forecastProduct, valuesKnownAt } from './engine';
import { MODEL_VERSION, type Classification, type DemandSeries, type ForecastProduct, type GuidanceObservation, type ProductForecast, completeSum, dateOnly, days, forecastConfiguration, forecastRules, includedInDemand, shift } from './model';

type Db = Prisma.TransactionClient | PrismaClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export type ForecastSummary = Omit<ProductForecast, 'locations' | 'history' | 'buckets' | 'guidance' | 'reasons'> & { guidanceMinimum: number | null; guidanceMaximum: number | null; guidanceThrough: string | null; locationCount: number; note: string | null };
export function summaryFor(forecast: ProductForecast): ForecastSummary {
  const { locations, history: _history, buckets: _buckets, guidance, reasons, ...summary } = forecast;
  return { ...summary, guidanceMinimum: completeSum(guidance.map(g => g.minimum)), guidanceMaximum: completeSum(guidance.map(g => g.maximum)), guidanceThrough: guidance.length ? guidance.map(g => g.date).sort()[0] : null, locationCount: locations.length, note: summary.point === null ? reasons[0] : null };
}
export async function configuredProducts(db: Db, organizationId: string, markets: string[]): Promise<ForecastProduct[]> {
  const products = await db.organizationProduct.findMany({ where: { organizationId, market: { in: markets }, active: true, discontinued: false, status: { in: ['OWNED', 'REPRESENTED'] } }, orderBy: [{ market: 'asc' }, { externalItemCode: 'asc' }], select: { id: true, market: true, externalItemCode: true, displayName: true } });
  const context = markets.includes('OH') ? await ohioItemContext(db, organizationId) : null;
  return products.map(p => ({ id: p.id, market: p.market, code: p.externalItemCode, name: p.displayName || p.externalItemCode, demandExcluded: p.market === 'OH' && Boolean(context?.distilleryOnly.has(p.externalItemCode)) }));
}
/** Batched reads, bounded demand history, explicit tenant and product scope. */
export async function loadForecastSources(db: Db, organizationId: string, products: ForecastProduct[], asOf: string) {
  const productWhere = products.map(p => ({ market: p.market, itemCode: p.code }));
  const markets = [...new Set(products.map(p => p.market))];
  const start = shift(asOf, 1 - forecastRules.maxHistoryDays);
  const [imports, observations, guidanceRows] = await Promise.all([
    db.productionSourceImport.findMany({ where: { organizationId, market: { in: markets }, status: 'COMPLETE', source: 'BAILMENT_PO_INVOICE', coverageStart: { lte: new Date(asOf) } }, orderBy: { importedAt: 'asc' }, select: { id: true, market: true, coverageStart: true, coverageEnd: true, summary: true, rowCount: true, excludedRows: true, importedAt: true } }),
    productWhere.length ? db.productionDemandObservation.findMany({ where: { organizationId, OR: productWhere, date: { gte: new Date(start), lte: new Date(asOf) }, availableOn: { lte: new Date(asOf) }, transactionStatus: { in: ['POSTED', 'SHIPPED'] }, classification: { not: 'A3A_DIST' }, sourceImport: { status: 'COMPLETE' } }, select: { market: true, itemCode: true, locationCode: true, locationName: true, date: true, availableOn: true, cases: true, classification: true } }) : [],
    productWhere.length ? db.productionGuidanceObservation.findMany({ where: { organizationId, OR: productWhere, observedOn: { lte: new Date(shift(asOf, 1)) }, classification: { not: 'A3A_DIST' }, sourceImport: { status: 'COMPLETE' } }, distinct: ['market', 'itemCode', 'locationCode'], orderBy: [{ observedOn: 'desc' }, { id: 'desc' }], select: { market: true, itemCode: true, locationCode: true, locationName: true, observedOn: true, minimum: true, maximum: true, classification: true } }) : [],
  ]);
  const allowed = new Set(products.filter(p => !p.demandExcluded).map(p => JSON.stringify([p.market, p.code])));
  const seriesMap = new Map<string, DemandSeries>();
  for (const batch of imports) {
    const scopes = (batch.summary as unknown as { scopes: SourceScope[] }).scopes;
    for (const scope of scopes) {
      if (!allowed.has(JSON.stringify([batch.market, scope.itemCode])) || !includedInDemand(scope.classification)) continue;
      const key = JSON.stringify([batch.market, scope.itemCode, scope.locationCode]);
      const series = seriesMap.get(key) ?? { market: batch.market, itemCode: scope.itemCode, location: { code: scope.locationCode, name: scope.locationName }, classification: scope.classification, coverage: [], observations: [] };
      const coverageStart = dateOnly(batch.coverageStart), coverageEnd = dateOnly(batch.coverageEnd);
      // Keep stale location identities, but never expand years of unused dates.
      if (coverageEnd >= start) series.coverage.push({ start: coverageStart < start ? start : coverageStart, end: coverageEnd > asOf ? asOf : coverageEnd });
      seriesMap.set(key, series);
    }
  }
  for (const row of observations) seriesMap.get(JSON.stringify([row.market, row.itemCode, row.locationCode]))?.observations.push({ date: dateOnly(row.date), availableOn: dateOnly(row.availableOn), cases: Number(row.cases), classification: row.classification as Classification });
  const guidance: GuidanceObservation[] = guidanceRows.map(r => ({ market: r.market, itemCode: r.itemCode, location: { code: r.locationCode, name: r.locationName }, date: dateOnly(r.observedOn), minimum: r.minimum === null ? null : Number(r.minimum), maximum: r.maximum === null ? null : Number(r.maximum), classification: r.classification as Classification }));
  return { series: [...seriesMap.values()], guidance, imports, sourceSummary: { source: 'Bailment PO / Invoice (verified normalized CSV)', batches: imports.length, importedRows: imports.reduce((n, i) => n + i.rowCount, 0), excludedRows: imports.reduce((n, i) => n + i.excludedRows, 0), latestImport: imports.at(-1)?.importedAt.toISOString() ?? null } };
}

export async function refreshProductionForecast(organizationId: string, db: PrismaClient = prisma, now = new Date()) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`production-forecast:${organizationId}`}))`;
    const organization = await forecastAccess(tx, organizationId);
    const today = formatDateInputValue(now, organization.timezone), asOf = shift(today, -1);
    const products = await configuredProducts(tx, organizationId, organization.enabledStates);
    const config = forecastConfiguration(organization.settings);
    const sources = await loadForecastSources(tx, organizationId, products, asOf);
    const runKey = createHash('sha256').update(JSON.stringify({ today, version: MODEL_VERSION, config, products, imports: sources.imports.map(i => i.id), guidance: sources.guidance })).digest('hex');
    const existing = await tx.productionForecastRun.findUnique({ where: { organizationId_runKey: { organizationId, runKey } }, select: { id: true } });
    // Actual evaluation is independent of whether today's run already exists.
    const awaiting = await tx.productionForecastSnapshot.findMany({ where: { organizationId, horizonEnd: { lt: new Date(today) }, actualEvaluatedAt: null }, take: 200, orderBy: { horizonEnd: 'asc' }, select: { id: true, market: true, itemCode: true, horizonStart: true, horizonEnd: true, detail: true } });
    for (const snapshot of awaiting) {
      const expected = (snapshot.detail as unknown as ProductForecast).locations.map(l => l.location.code);
      const selected = sources.series.filter(s => s.market === snapshot.market && s.itemCode === snapshot.itemCode);
      if (!expected.length || expected.some(code => !selected.some(s => s.location.code === code))) continue;
      const actual = completeSum(selected.map(s => { const values = valuesKnownAt(s, asOf); return completeSum(days(dateOnly(snapshot.horizonStart), dateOnly(snapshot.horizonEnd)).map(d => values.get(d) ?? null)); }));
      if (actual !== null) await tx.productionForecastSnapshot.updateMany({ where: { id: snapshot.id, organizationId, actualEvaluatedAt: null }, data: { actualCases: actual, actualEvaluatedAt: now } });
    }
    if (existing) return { id: existing.id, replay: true, products: products.length };
    // DISTINCT ON executes in PostgreSQL. Prisma's client-side distinct would
    // transfer every old detail document merely to keep one per product.
    const previous = products.length ? await tx.$queryRaw<{ productId: string; detail: Prisma.JsonValue }[]>(Prisma.sql`
      SELECT DISTINCT ON (s."productId") s."productId", s.detail
      FROM "ProductionForecastSnapshot" s JOIN "ProductionForecastRun" r ON r.id=s."runId" AND r."organizationId"=s."organizationId"
      WHERE s."organizationId"=${organizationId} AND s."productId" IN (${Prisma.join(products.map(p => p.id))})
      ORDER BY s."productId", r."generatedAt" DESC, r.id DESC`) : [];
    const previousMap = new Map(previous.map(p => [p.productId, p.detail as unknown as ProductForecast]));
    const results = products.map(p => forecastProduct(p, sources.series, sources.guidance, asOf, previousMap.get(p.id) ?? null, config));
    const forecastable = results.filter(r => r.point !== null && r.dataThrough);
    const dataThrough = forecastable.length ? forecastable.map(r => r.dataThrough!).sort()[0] : null;
    const run = await tx.productionForecastRun.create({ data: { organizationId, runKey, generatedAt: now, horizonStart: new Date(today), horizonEnd: new Date(shift(today, 29)), dataThrough: dataThrough ? new Date(dataThrough) : null, modelVersion: MODEL_VERSION, configuration: json(config), sourceSummary: json(sources.sourceSummary) } });
    if (results.length) await tx.productionForecastSnapshot.createMany({ data: results.map(result => ({ organizationId, runId: run.id, productId: result.product.id, market: result.product.market, itemCode: result.product.code, horizonStart: new Date(result.start), horizonEnd: new Date(result.end), point: result.point, lower: result.lower, upper: result.upper, target: result.target, confidence: result.confidence, method: [...new Set(result.locations.map(l => l.method).filter(Boolean))].join(',') || 'unavailable', summary: json(summaryFor(result)), detail: json(result) })) });
    return { id: run.id, replay: false, products: results.length };
  }, { timeout: 120000 });
}

export async function getProductionDashboard(organizationId: string, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    const organization = await forecastAccess(tx, organizationId);
    const products = await configuredProducts(tx, organizationId, organization.enabledStates);
    const run = await tx.productionForecastRun.findFirst({ where: { organizationId }, orderBy: { generatedAt: 'desc' }, select: { id: true, generatedAt: true, horizonStart: true, horizonEnd: true, dataThrough: true, sourceSummary: true } });
    // The table never loads detail JSON or observations. Products missing from a
    // precomputed run remain visible and clearly unavailable until refreshed.
    const snapshots = run ? await tx.productionForecastSnapshot.findMany({ where: { organizationId, runId: run.id, productId: { in: products.map(p => p.id) } }, select: { productId: true, summary: true } }) : [];
    const map = new Map(snapshots.map(s => [s.productId, s.summary as unknown as ForecastSummary]));
    const today = formatDateInputValue(new Date(), organization.timezone);
    const rows = products.map(product => {
      const saved = map.get(product.id);
      if (saved && !product.demandExcluded) return { ...saved, product };
      return { ...summaryFor(forecastProduct(product, [], [], shift(today, -1))), ...(product.demandExcluded ? {} : { note: 'Awaiting a source import and scheduled forecast refresh.' }) };
    });
    const latestImports = await tx.productionSourceImport.findMany({ where: { organizationId }, distinct: ['market', 'source'], orderBy: { importedAt: 'desc' }, select: { source: true, market: true, observedOn: true, importedAt: true, status: true, excludedRows: true } });
    return { rows, run: run ? { ...run, generatedAt: run.generatedAt.toISOString(), horizonStart: dateOnly(run.horizonStart), horizonEnd: dateOnly(run.horizonEnd), dataThrough: run.dataThrough ? dateOnly(run.dataThrough) : null } : null, today, latestImports: latestImports.map(i => ({ ...i, observedOn: dateOnly(i.observedOn), importedAt: i.importedAt.toISOString() })) };
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
export async function getProductionProduct(organizationId: string, productId: string, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    const organization = await forecastAccess(tx, organizationId);
    const products = await configuredProducts(tx, organizationId, organization.enabledStates);
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    const latestRun = await tx.productionForecastRun.findFirst({ where: { organizationId }, orderBy: { generatedAt: 'desc' }, select: { id: true, generatedAt: true } });
    const snapshot = latestRun ? await tx.productionForecastSnapshot.findFirst({ where: { organizationId, productId, runId: latestRun.id }, select: { detail: true } }) : null;
    const history = await tx.productionForecastSnapshot.findMany({ where: { organizationId, productId }, orderBy: { run: { generatedAt: 'desc' } }, take: 10, select: { id: true, horizonStart: true, horizonEnd: true, point: true, actualCases: true, actualEvaluatedAt: true, run: { select: { generatedAt: true } } } });
    return { forecast: product.demandExcluded ? forecastProduct(product, [], [], shift(formatDateInputValue(new Date(), organization.timezone), -1)) : snapshot?.detail as unknown as ProductForecast | null, history: history.map(h => ({ id: h.id, start: dateOnly(h.horizonStart), end: dateOnly(h.horizonEnd), point: h.point === null ? null : Number(h.point), actual: h.actualCases === null ? null : Number(h.actualCases), generatedAt: h.run.generatedAt.toISOString() })) };
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
