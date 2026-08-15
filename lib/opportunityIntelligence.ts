import { OpportunityType } from '@prisma/client';
import { opportunityCategoryMap, opportunityRules, type PortfolioCategory } from './opportunityConfig';

export type PurchaseSignal = {
  category: PortfolioCategory | null;
  itemCode: string;
  itemName: string;
  isEcho: boolean;
  lastPurchaseAt: string | null;
  bottles30: number;
  bottles60: number;
  bottles90: number;
  currentAnnualBottles: number;
};

export type AccountOpportunitySignals = {
  asOfDate: string;
  accountStatus: string;
  assignedUserId: string | null;
  daysSinceLastEchoPurchase: number | null;
  daysSinceLastVisit: number | null;
  echoBottles30: number;
  echoBottles60: number;
  echoBottles90: number;
  echoPurchaseEvents90: number;
  firstEchoPurchaseAt: string | null;
  historyComplete: boolean;
  lastEchoPurchaseAt: string | null;
  lastVisitAt: string | null;
  openWorklistCount: number;
  purchases: PurchaseSignal[];
  targetStatus: string | null;
  visits30: number;
  visits60: number;
  visits90: number;
};

export type OpportunityHypothesis = {
  cycleKey: string;
  explanation: string[];
  recommendedAction: string;
  targetCategory: PortfolioCategory | null;
  title: string;
  type: OpportunityType;
};

const echoForCategory = (s: AccountOpportunitySignals, category: PortfolioCategory) =>
  s.purchases.filter((item) => item.isEcho && item.category === category);
const allForCategory = (s: AccountOpportunitySignals, category: PortfolioCategory) =>
  s.purchases.filter((item) => item.category === category);
const sum90 = (items: PurchaseSignal[]) => items.reduce((sum, item) => sum + item.bottles90, 0);
const labels = (items: PurchaseSignal[]) => items.slice(0, 3).map((item) => `${item.itemCode} - ${item.itemName}`);

export function detectOpportunityHypotheses(signals: AccountOpportunitySignals): OpportunityHypothesis[] {
  if (signals.accountStatus === 'DO_NOT_PURSUE') return [];
  const result: OpportunityHypothesis[] = [];
  const lastEcho = signals.purchases.filter((item) => item.isEcho).sort((a, b) =>
    (b.lastPurchaseAt ?? '').localeCompare(a.lastPurchaseAt ?? ''))[0];

  if (signals.lastEchoPurchaseAt && signals.daysSinceLastEchoPurchase !== null &&
      signals.daysSinceLastEchoPurchase >= opportunityRules.lapseRecentDays &&
      signals.daysSinceLastEchoPurchase <= opportunityRules.lapseLookbackDays) {
    result.push({
      type: OpportunityType.LAPSED_BUYER,
      cycleKey: `lapsed:${signals.lastEchoPurchaseAt}`,
      targetCategory: lastEcho?.category ?? null,
      title: 'Lapsed Echo buyer',
      recommendedAction: 'Reactivation follow-up',
      explanation: [
        signals.echoBottles90 > 0
          ? `${signals.echoBottles90} Echo bottles observed in the event ledger in 90 days; none in 30 days`
          : 'Stored purchase history shows an Echo purchase within 90 days and none within 30 days',
        `Last Echo purchase ${signals.daysSinceLastEchoPurchase ?? 'unknown'} days ago`,
        ...labels(lastEcho ? [lastEcho] : []),
      ],
    });
  }

  if (signals.historyComplete && signals.firstEchoPurchaseAt && signals.echoBottles30 > 0) {
    const echoItems = signals.purchases.filter((item) => item.isEcho && item.currentAnnualBottles > 0);
    const firstAt = new Date(signals.firstEchoPurchaseAt);
    const asOf = new Date(signals.asOfDate);
    const days = Math.floor((asOf.getTime() - firstAt.getTime()) / 86400000);
    if (days <= opportunityRules.firstOrderWindowDays && signals.echoPurchaseEvents90 === 1) {
      result.push({
        type: OpportunityType.FIRST_ORDER_FOLLOW_UP,
        cycleKey: `first:${signals.firstEchoPurchaseAt}`,
        targetCategory: echoItems[0]?.category ?? null,
        title: 'First-order follow-up',
        recommendedAction: 'Follow up for feedback and a reorder',
        explanation: [`First observed Echo purchase ${days} days ago`, ...labels(echoItems)],
      });
    }
  }

  (Object.keys(opportunityCategoryMap) as PortfolioCategory[]).forEach((category) => {
    const categoryItems = allForCategory(signals, category);
    const categoryVolume = sum90(categoryItems);
    const echoItems = echoForCategory(signals, category);
    if (categoryVolume < opportunityRules.minimumCategoryBottles90Days || echoItems.some((item) => item.currentAnnualBottles > 0)) return;
    const existingEcho = signals.purchases.some((item) => item.isEcho && item.currentAnnualBottles > 0);
    const type = existingEcho ? OpportunityType.CROSS_SELL : OpportunityType.CATEGORY_CONQUEST;
    result.push({
      type,
      targetCategory: category,
      cycleKey: `${type.toLowerCase()}:${category}:${categoryItems.map((item) => item.lastPurchaseAt ?? '').sort().at(-1) ?? 'observed'}`,
      title: existingEcho ? `Cross-sell ${opportunityCategoryMap[category].label}` : `${opportunityCategoryMap[category].label} buyer / Echo nonbuyer`,
      recommendedAction: `Discuss Echo ${opportunityCategoryMap[category].label}`,
      explanation: [
        `${categoryVolume} ${opportunityCategoryMap[category].label.toLowerCase()} bottles purchased in 90 days`,
        `No Echo ${opportunityCategoryMap[category].label} purchase observed`,
        ...labels(categoryItems.filter((item) => !item.isEcho)),
      ],
    });
  });

  if (signals.echoBottles90 >= opportunityRules.activePurchaseBottles90Days &&
      (signals.daysSinceLastVisit === null || signals.daysSinceLastVisit >= opportunityRules.noTouchDays)) {
    result.push({
      type: OpportunityType.NO_RECENT_TOUCH,
      cycleKey: `touch:${signals.lastVisitAt ?? 'never'}`,
      targetCategory: null,
      title: 'Active customer needing attention',
      recommendedAction: 'Visit or contact account',
      explanation: [
        `${signals.echoBottles90} Echo bottles purchased in 90 days`,
        signals.daysSinceLastVisit === null ? 'No CRM visit recorded' : `Last CRM visit ${signals.daysSinceLastVisit} days ago`,
      ],
    });
  }
  return result;
}

export type RankResult = { score: number; priorityBand: 'HIGH' | 'MEDIUM' | 'LOW'; factors: string[]; version: string };
export interface OpportunityRanker { rank(opportunity: OpportunityHypothesis, signals: AccountOpportunitySignals): RankResult }

export class RuleBasedOpportunityRanker implements OpportunityRanker {
  rank(opportunity: OpportunityHypothesis, signals: AccountOpportunitySignals): RankResult {
    const factors = [...opportunity.explanation];
    let score = 30;
    score += Math.min(30, signals.echoBottles90 * 0.8);
    score += Math.min(20, opportunity.targetCategory ? sum90(allForCategory(signals, opportunity.targetCategory)) * 0.3 : 0);
    score += Math.min(15, (signals.daysSinceLastVisit ?? 90) / 6);
    score -= Math.min(10, signals.openWorklistCount * 2);
    score = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
    return { score, priorityBand: score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW', factors, version: 'RULE_BASED_V1' };
  }
}

export function analyzeActivityToPurchases(activityAt: Date, purchases: Date[]) {
  const ordered = [...purchases].sort((a, b) => a.getTime() - b.getTime());
  const later = ordered.filter((date) => date >= activityAt);
  const next = later[0] ?? null;
  const daysToNextPurchase = next ? Math.floor((next.getTime() - activityAt.getTime()) / 86400000) : null;
  return {
    purchaseWithin7Days: daysToNextPurchase !== null && daysToNextPurchase <= 7,
    purchaseWithin14Days: daysToNextPurchase !== null && daysToNextPurchase <= 14,
    purchaseWithin30Days: daysToNextPurchase !== null && daysToNextPurchase <= 30,
    firstPurchaseAfterActivity: Boolean(next && ordered[0]?.getTime() === next.getTime()),
    reorderAfterActivity: Boolean(next && ordered[0]?.getTime() !== next.getTime()),
    daysToNextPurchase,
  };
}

export function rescoreHistoricalSnapshot(snapshot: AccountOpportunitySignals, hypothesis: OpportunityHypothesis, ranker: OpportunityRanker) {
  return ranker.rank(hypothesis, structuredClone(snapshot));
}
