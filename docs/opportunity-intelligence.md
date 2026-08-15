# Opportunity Intelligence V1

## Architecture

The learning loop is deliberately separated into raw events (`AccountSalesEvent`, CRM visits and worklist history), current signals (`OpportunityAccountSignal`), immutable detection snapshots (`SalesOpportunity.signalSnapshot`), hypotheses (`detectOpportunityHypotheses`), ranking (`OpportunityRanker`), recommended actions, lifecycle events (`OpportunityEvent`), outcomes, and historical evaluation.

OHLQ annual reports are cumulative daily snapshots. Before the existing 30-day retention job deletes an old snapshot, the import workflow compares the new report with the previous successful report and persists positive bottle deltas as immutable account sales events. The first available report is a baseline and is not misrepresented as a purchase. `sourceKey` makes retries idempotent.

## V1 rules and scoring

Rules live in `lib/opportunityConfig.ts` and are versioned as `RULES_V1`.

- Lapsed buyer: an Echo purchase in 90 days, none in 30. A new cycle is keyed to the last purchase.
- First-order follow-up: first observed Echo purchase within 30 days and no second observed item purchase. It is only enabled when `historyComplete` is true, preventing a retained-data window from becoming a false “first ever” claim.
- Category conquest: at least six bottles in a mapped Bourbon, Rye, or Rum category in 90 days and no observed Echo purchase in that category.
- Cross-sell: the same category condition, plus an existing Echo relationship in another category.
- No recent touch: at least six Echo bottles in 90 days and no qualifying CRM visit in 45 days.

`RuleBasedOpportunityRanker` returns a 0–100 score, HIGH/MEDIUM/LOW band, explanation factors, and `RULE_BASED_V1`. It combines Echo velocity, relevant category volume, CRM-touch age and open-workload pressure. The explanation, not the number, is the primary UI.

## History, outcomes, and worklist behavior

Detection stores the complete feature JSON plus rule/scoring versions. It is never overwritten; later current-signal updates cannot mutate it. `OpportunityEvent` is append-oriented and uses `(opportunityId,eventKey)` uniqueness for cron retry safety. Dismissal and snooze are scoped to one opportunity cycle; a genuinely new cycle can surface later. A `DO NOT PURSUE` tag suppresses all automatic detection.

New Echo purchases convert lapsed/first-order opportunities. A first Echo purchase in the target category converts category conquest/cross-sell. A subsequent visit resolves no-touch. Converted/resolved opportunities close only their linked automated worklist item; manual work is never changed. Open negative examples remain and eventually become `EXPIRED` after 120 days.

Automatic work creation is per-type configuration. V1 creates work for lapsed, first-order and no-touch; category and cross-sell initially remain suggestions. `salesOpportunityId` prevents duplicates.

## Analysis and learning

`analyzeActivityToPurchases` reports whether a purchase followed a visit or completed follow-up within 7, 14 and 30 days and the days to the next purchase. The admin report uses correlational language. Account pages provide one mobile vertical timeline combining visits, purchases, and opportunity detections; purchase entries always show item code and name.

Historical snapshots can be passed to any `OpportunityRanker` through `rescoreHistoricalSnapshot` without changing the production score. `OpportunityModelVersion` and `OpportunityScore.mode` support ACTIVE and SHADOW strategies. A future learned per-opportunity model should register its configuration/version, score the same immutable snapshots in SHADOW mode, and compare top-N precision, lift, conversion by decile, dismissal rate and time-to-conversion before promotion.

Future training should use rolling 12–18 month windows with more weight on the latest 90–180 days. Model performance should be trended by month/quarter and model version to reveal drift. A later recommendation allocator may reserve a controlled 10–20% exploration cohort without inserting random low-quality work.

## Operational sequence

After both sales reports import successfully: derive sales events, update account signals, detect hypotheses, preserve new snapshots/events, calculate active scores, create configured work, label conversions/resolutions/expirations, then prune raw snapshots. Failed or incomplete imports never invoke the engine. Visits trigger account-scoped reevaluation immediately.

## Manual QA

Verify seeded or real examples for active, lapsed, first, category, cross-sell, no-touch, do-not-pursue, snoozed, dismissed, converted and expired states. For each, inspect the Inbox card, dashboard count, account intelligence, timeline, linked work, snapshot JSON, unique event history and scoring version. Run one report date twice and confirm no duplicate sales events, opportunities, lifecycle events, scores or work. Confirm a visit followed by a purchase and a visit with no purchase in the admin report, on a narrow mobile viewport.

## Known V1 assumptions and next steps

Category aliases are centralized but should be validated against live OHLQ master category/name values. Dollar/case features are not claimed because the wholesale feed currently persists bottles, not transactional dollars. Historical `historyComplete` remains false until a trustworthy purchase-history backfill establishes a real beginning. Next: backfill the account sales-event ledger from retained/archive reports, validate portfolio category mappings, materialize first/reorder labels, add score-decile/top-N evaluation, and configure the first shadow ranker.
