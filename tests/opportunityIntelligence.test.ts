import assert from 'node:assert/strict';
import { it } from 'node:test';
import { analyzeActivityToPurchases } from '../lib/opportunityIntelligence';

it('visit/follow-up analysis uses inclusive 7/14/30-day windows and avoids causal labels', () => { const activity = new Date('2026-08-01T00:00:00Z'); assert.deepEqual(analyzeActivityToPurchases(activity, [new Date('2026-08-08T00:00:00Z')]), { purchaseWithin7Days: true, purchaseWithin14Days: true, purchaseWithin30Days: true, firstPurchaseAfterActivity: true, reorderAfterActivity: false, daysToNextPurchase: 7 }); assert.equal(analyzeActivityToPurchases(activity, []).daysToNextPurchase, null); });
