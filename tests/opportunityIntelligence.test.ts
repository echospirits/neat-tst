import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OpportunityType } from '@prisma/client';
import { analyzeActivityToPurchases, detectOpportunityHypotheses, rescoreHistoricalSnapshot, RuleBasedOpportunityRanker, type AccountOpportunitySignals } from '../lib/opportunityIntelligence';

const base = (overrides: Partial<AccountOpportunitySignals> = {}): AccountOpportunitySignals => ({
  asOfDate: '2026-08-14', accountStatus: 'ACTIVE', assignedUserId: null, daysSinceLastEchoPurchase: null, daysSinceLastVisit: 60,
  echoBottles30: 0, echoBottles60: 0, echoBottles90: 0, echoPurchaseEvents90: 0, firstEchoPurchaseAt: null, historyComplete: true, lastEchoPurchaseAt: null,
  lastVisitAt: '2026-06-15T12:00:00.000Z', openWorklistCount: 0, purchases: [], targetStatus: null, visits30: 0, visits60: 0, visits90: 1, ...overrides,
});
const item = (overrides: Partial<AccountOpportunitySignals['purchases'][number]> = {}) => ({ category: 'BOURBON' as const, itemCode: '2804B', itemName: 'Echo Bourbon', isEcho: true, lastPurchaseAt: '2026-07-05', bottles30: 0, bottles60: 4, bottles90: 4, currentAnnualBottles: 4, ...overrides });

describe('opportunity detectors', () => {
  it('detects lapsed buyer with item code and name explanation', () => { const found = detectOpportunityHypotheses(base({ echoBottles90: 4, lastEchoPurchaseAt: '2026-07-05', daysSinceLastEchoPurchase: 40, purchases: [item()] })); assert.equal(found[0].type, OpportunityType.LAPSED_BUYER); assert.match(found[0].explanation.join(' '), /2804B - Echo Bourbon/); });
  it('detects first-order follow-up only with complete history', () => { const signal = base({ echoBottles30: 2, echoBottles90: 2, echoPurchaseEvents90: 1, firstEchoPurchaseAt: '2026-08-05', lastEchoPurchaseAt: '2026-08-05', purchases: [item({ bottles30: 2, bottles90: 2 })] }); assert.ok(detectOpportunityHypotheses(signal).some((o) => o.type === OpportunityType.FIRST_ORDER_FOLLOW_UP)); assert.ok(!detectOpportunityHypotheses({ ...signal, historyComplete: false }).some((o) => o.type === OpportunityType.FIRST_ORDER_FOLLOW_UP)); });
  it('detects category conquest', () => { const found = detectOpportunityHypotheses(base({ purchases: [item({ itemCode: 'COMP1', itemName: 'Competitor Bourbon', isEcho: false, bottles90: 20 })] })); assert.ok(found.some((o) => o.type === OpportunityType.CATEGORY_CONQUEST)); });
  it('detects cross-sell independently by category', () => { const found = detectOpportunityHypotheses(base({ echoBottles90: 3, purchases: [item({ bottles90: 3 }), item({ category: 'RYE', itemCode: 'RYE1', itemName: 'Competitor Rye', isEcho: false, bottles90: 20 })] })); assert.ok(found.some((o) => o.type === OpportunityType.CROSS_SELL && o.targetCategory === 'RYE')); });
  it('detects active customer with no recent touch', () => { const found = detectOpportunityHypotheses(base({ echoBottles90: 10, daysSinceLastVisit: 80, purchases: [item({ bottles90: 10 })] })); assert.ok(found.some((o) => o.type === OpportunityType.NO_RECENT_TOUCH)); });
  it('suppresses every automatic detector for do-not-pursue', () => assert.deepEqual(detectOpportunityHypotheses(base({ accountStatus: 'DO_NOT_PURSUE', echoBottles90: 20 })), []));
});

it('ranker returns score, band, explanation, and swappable historical rescore without mutating snapshot', () => { const signal = base({ echoBottles90: 20 }); const hypothesis = { type: OpportunityType.NO_RECENT_TOUCH, cycleKey: 'x', targetCategory: null, title: 'x', recommendedAction: 'visit', explanation: ['No visit'] }; const before = structuredClone(signal); const result = rescoreHistoricalSnapshot(signal, hypothesis, new RuleBasedOpportunityRanker()); assert.ok(result.score > 0); assert.ok(result.factors.length); assert.deepEqual(signal, before); });

it('visit/follow-up analysis uses inclusive 7/14/30-day windows and avoids causal labels', () => { const activity = new Date('2026-08-01T00:00:00Z'); assert.deepEqual(analyzeActivityToPurchases(activity, [new Date('2026-08-08T00:00:00Z')]), { purchaseWithin7Days: true, purchaseWithin14Days: true, purchaseWithin30Days: true, firstPurchaseAfterActivity: true, reorderAfterActivity: false, daysToNextPurchase: 7 }); assert.equal(analyzeActivityToPurchases(activity, []).daysToNextPurchase, null); });
