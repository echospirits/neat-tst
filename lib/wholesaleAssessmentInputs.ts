import type { OrganizationProduct, OhlqBrandMasterItem } from '@prisma/client';
import { catalogLiters, isKnownOhioBrand, pricePer750 } from './opportunityAffinity';
import { normalizeOpportunityCategory } from './opportunityConfig';
import { isOpportunityEligibleOhlqProduct } from './ohlqProductEligibility';
import { normalizeUsState } from './usStates';
import type { AssessmentProduct, AssessmentPurchase, StrategyRole, UseEvidence, ResearchSignals, ResearchFact } from './wholesaleAssessment';
import { positiveResearchClauses } from './wholesaleAssessment';

function catalogPrices(master: OhlqBrandMasterItem | undefined, wholesaleApplicable = true) {
  const wholesalePrice750 = master && wholesaleApplicable ? pricePer750(master.wholesalePrice, master.productVolume) : null;
  const retailPrice750 = master ? pricePer750(master.retailPrice, master.productVolume) : null;
  return { price750: wholesalePrice750 ?? retailPrice750, wholesalePrice750, retailPrice750,
    priceBasis: wholesalePrice750 !== null ? 'PUBLISHED_WHOLESALE' as const : retailPrice750 !== null ? 'CATALOG_RETAIL_PROXY' as const : 'UNKNOWN' as const };
}

export function marketPortfolio(decisions: OrganizationProduct[], catalog: Map<string, OhlqBrandMasterItem>, state: string | null,
  inventory: { trusted: boolean; available: Set<string>; distilleryOnly: Set<string> }): AssessmentProduct[] {
  const market = normalizeUsState(state);
  const codes = [...new Set(decisions.map(p => p.externalItemCode))];
  return codes.flatMap(code => {
    const exact = decisions.find(p => p.externalItemCode === code && p.market === market);
    const decision = exact ?? decisions.find(p => p.externalItemCode === code && p.market === 'ALL') ?? decisions.find(p => p.externalItemCode === code && p.active && !p.discontinued && ['OWNED', 'REPRESENTED'].includes(p.status));
    if (!decision || !decision.active || decision.discontinued || !['OWNED', 'REPRESENTED'].includes(decision.status)) return [];
    const master = catalog.get(code);
    // Catalog discontinued/ineligible products remain excluded. Current warehouse routing
    // and temporary stock availability are execution context, never commercial inclusion.
    if (market === 'OH' && master && !isOpportunityEligibleOhlqProduct(master, new Set<string>())) return [];
    const availability = decision.distributionStatus === 'UNAVAILABLE' && (exact || decision.market === 'ALL') ? 'UNAVAILABLE'
      : decision.distributionStatus === 'AVAILABLE' && (exact || decision.market === 'ALL') ? 'AVAILABLE'
      : market === 'OH' && inventory.trusted ? inventory.available.has(code) ? 'AVAILABLE' : 'UNAVAILABLE' : 'UNVERIFIED';
    return [{ itemCode: code, name: decision.displayName ?? master?.name ?? code, category: normalizeOpportunityCategory(master?.category ?? decision.category, master?.name ?? decision.displayName),
      subtype: decision.subcategory, ...catalogPrices(master, market === 'OH'),
      liters: master ? catalogLiters(master.productVolume) : null, priority: decision.strategicPriority,
      role: ['FOCUS','OPPORTUNISTIC','MAINTENANCE'].includes(decision.opportunityRole ?? '') ? decision.opportunityRole as StrategyRole : 'NEUTRAL', availability }];
  });
}

export function aggregatePurchases(events: Array<{ itemCode: string; itemName: string; category: string | null; bottles: number; reportDate: Date }>,
  catalog: Map<string, OhlqBrandMasterItem>, tenantCodes: Set<string>, asOf: Date): AssessmentPurchase[] {
  const purchases = new Map<string, AssessmentPurchase>();
  for (const event of events) {
    const days = Math.round((asOf.getTime() - event.reportDate.getTime()) / 86_400_000);
    if (days < 0 || days >= 90) continue;
    const master = catalog.get(event.itemCode);
    let purchase = purchases.get(event.itemCode);
    if (!purchase) {
      purchase = { itemCode: event.itemCode, name: master?.name ?? event.itemName,
        category: normalizeOpportunityCategory(master?.category ?? event.category, master?.name ?? event.itemName), subtype: null,
        ...catalogPrices(master), liters: master ? catalogLiters(master.productVolume) : null,
        local: isKnownOhioBrand(master?.name ?? event.itemName), tenant: tenantCodes.has(event.itemCode), bottles30: 0, bottles60: 0, bottles90: 0, orderDates: [] };
      purchases.set(event.itemCode, purchase);
    }
    purchase.bottles90 += event.bottles;
    if (days < 60) purchase.bottles60 += event.bottles;
    if (days < 30) purchase.bottles30 += event.bottles;
    const date = event.reportDate.toISOString().slice(0,10);
    if (event.bottles > 0 && !purchase.orderDates.includes(date)) purchase.orderDates.push(date);
  }
  return [...purchases.values()];
}

// Read saved evidence only. Catalog identity resolution does not crawl, call a provider,
// assign group-scale facts to a location, or infer a bottle price from a cocktail price.
export function storedResearchSignals(research: unknown, catalog = new Map<string, OhlqBrandMasterItem>()): ResearchSignals {
  const empty: ResearchSignals = { evidence: [], publicRatings: [], comparables: [] };
  if (!research || typeof research !== 'object') return empty;
  const row = research as { identitySnapshot?: unknown; lastRefreshedAt?: Date | string | null };
  if (!row.identitySnapshot || typeof row.identitySnapshot !== 'object' || !row.lastRefreshedAt) return empty;
  const observedAt = row.lastRefreshedAt instanceof Date ? row.lastRefreshedAt.toISOString() : row.lastRefreshedAt;
  const snapshot = row.identitySnapshot as { researchEvidence?: ResearchFact[]; publicRatings?: Array<{ reviewCount: number | null; rating: number; sourceUrl: string }>; productUses?: UseEvidence[] };
  const evidence = (Array.isArray(snapshot.researchEvidence) ? snapshot.researchEvidence : []).filter(e => e && typeof e.field === 'string' && typeof e.claim === 'string' && typeof e.sourceUrl === 'string' && typeof e.exactLocation === 'boolean').map(e => ({ ...e, observedAt: e.observedAt ?? observedAt }));
  const publicRatings = (Array.isArray(snapshot.publicRatings) ? snapshot.publicRatings : []).filter(r => r && typeof r.sourceUrl === 'string' && typeof r.rating === 'number' && (r.reviewCount === null || typeof r.reviewCount === 'number')).map(r => ({ ...r, observedAt }));
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const currentPositive = (claim: string) => !/\b(?:formerly|previously|historical|used to|no|not|without|removed|discontinued)\b/i.test(claim)
    && ![...claim.matchAll(/\bin (20\d\d)\b/gi)].some(m => Number(m[1]) < new Date(observedAt).getUTCFullYear());
  const menuFacts = evidence.filter(e => e.exactLocation && e.sourceUrl && /menu|spirits|cocktail|brand|pour|beverage/i.test(e.field))
    .flatMap(e => positiveResearchClauses(e.claim).filter(currentPositive).map(claim => ({ ...e, claim })));
  const comparables: ResearchSignals['comparables'] = [];
  for (const master of catalog.values()) {
    const name = normalize(master.name);
    if (name.length < 5) continue;
    const fact = menuFacts.find(e => (' ' + normalize(e.claim) + ' ').includes(' ' + name + ' '));
    const placement = (Array.isArray(snapshot.productUses) ? snapshot.productUses : []).find(e => e && e.exactLocation && e.source && e.kind === 'MENU' && currentPositive(e.claim ?? '') && !/REMOVED|INACTIVE|ENDED/.test(e.status ?? '') && e.pouredProduct && normalize(e.pouredProduct) === name);
    if (!fact && !placement) continue;
    // Public menu identity gives positioning, not a verified account-facing invoice.
    comparables.push({ itemCode: master.itemCode, name: master.name, category: normalizeOpportunityCategory(master.category, master.name), subtype: null,
      ...catalogPrices(master, false), source: fact?.sourceUrl ?? placement!.source,
      observedAt: fact?.observedAt ?? placement!.observedAt, exactLocation: true });
  }
  return { evidence, publicRatings, comparables };
}

export function storedResearchUses(snapshot: unknown, observedAt: string | null, validIdentity: boolean): UseEvidence[] {
  if (!snapshot || typeof snapshot !== 'object' || !validIdentity || !observedAt) return [];
  const stored = snapshot as { productUses?: UseEvidence[]; researchEvidence?: Array<{ field: string; claim: string; sourceUrl: string; exactLocation: boolean }> };
  const structured = Array.isArray(stored.productUses) ? stored.productUses.filter(e => e && typeof e.use === 'string' && typeof e.source === 'string' && typeof e.observedAt === 'string' && typeof e.exactLocation === 'boolean') : [];
  // Legacy facts can support a menu-use hypothesis, never buyer demand or popularity.
  const legacy = (Array.isArray(stored.researchEvidence) ? stored.researchEvidence : []).flatMap(e => {
    if (!e.exactLocation || !/menu|cocktail/i.test(e.field) || !e.sourceUrl) return [];
    const matched = ['BOURBON','RYE','RUM','VODKA','GIN','TEQUILA'].filter(c => new RegExp(`\\b${c}\\b`, 'i').test(e.claim));
    return matched.map(category => ({ productCode: null, category, subtype: null, use: `${category.toLowerCase()} menu use`, kind: 'MENU' as const,
      claim: e.claim, source: e.sourceUrl, observedAt, exactLocation: true, pouredProduct: null, status: null }));
  });
  return [...structured, ...legacy];
}
