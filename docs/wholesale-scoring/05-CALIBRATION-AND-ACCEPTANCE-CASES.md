# Calibration and acceptance cases

Model/calibration: WHOLESALE_COMMERCIAL_V1 / COMMERCIAL_2026_10_V1. Boundaries are provisional implementation heuristics. The owner supplied tier meanings, focus principle, prohibited factors and qualitative case behavior; the numerical choices belong to this implementation and are not attributed to consultants.

## Initial TST distribution context

Read-only TST evidence on 2026-10-10 contained 15,386 non-merged accounts and three enabled tenants. The certified September 9–26 foundation spans 18 days. Of that population, 7,005 accounts purchased something.

Before price/style/size compatibility, raw bottle counts normalized by 30/18 were:

| Percentile | All-product bottles/30 | Deepest item bottles/30 |
| --- | ---: | ---: |
| 10 | 20 | 5 |
| 30 | 53.33 | 10 |
| 50 | 98.33 | 20 |
| 70 | 164.67 | 33.33 |
| 90 | 326.67 | 80 |
| 95 | 443.33 | 140 |
| 99 | 884.93 | 359.2 |

These are raw all-product bottles, not compatible normalized volume or final stars. 1,652 purchasing accounts (about 23.6%) were below the proposed raw leading-depth/core floor before additional compatibility exclusions. Zero-purchase accounts and incompatible streams legitimately expand the zero population.

The comparison includes all applicable tenant/accounts: customers, prospects, no-pursuit accounts, and snoozed/dismissed/assigned/unassigned records. No territory, radius or UI filter gets its own percentile curve. Approximately the commercial bottom 30% is a focus calibration signal, not a forced quota. The absolute floor remains necessary; more than 30% may warrant zero.

## Synthetic acceptance results

Named cases are owner-reported archetypes represented by labeled synthetic inputs, not audited account histories or committed private exports. Names never enter the formula.

| Case | Actual model result |
| --- | --- |
| Denmark-like 36/month, leading item 5, friendly context | 0 |
| Giuseppe-like 240 across 80 items at 3 | 0 |
| Equal 240 in two recurring 120-product streams | 5 |
| Strong core plus 100 slow products | 5 |
| Tiny concentrated 3/month | 0 |
| Cheap 300/month at $12 for $12 tenant | 5 |
| Same cheap stream for $30 tenant | 0 |
| 1,000 cheap plus 60 premium, premium tenant | 3; only 60 counted |
| Different contacts/pursuit/strategy/visits | Identical |
| Equivalent duplicate tenant SKU | Identical |
| Established local tenant customer at 300/month | 5 |
| Seasonal institutional venue at 300/month, unknown access | 5; observed-season caveat |
| Weak sales plus excellent public research | 0 |
| Complete 30-day 240 versus complete 90-day 720 | Both 5 |
| Strong relevant research program/scale/price | 5 |
| Missing essential research evidence | null/Unrated |
| Tiny known stream plus large unknown-price purchases | null/Unrated, not zero |
| Solid known core plus missing-price purchases | Positive lower-bound tier with limitations |
| Local $12 vodka versus $32 premium vodka | 0 |
| Incidental matching bottle in huge venue | At most 2 |
| Two platforms with 800 reviews each | Scale 3, using 800 |
| Group capacity or historical program only | null/Unrated |
| 240/month on one date | 4 |
| 480/month on one date or unknown timing | 5 |

## Verification and sensitivity

```powershell
node --import tsx --test tests/wholesaleAssessment.test.ts tests/wholesaleAssessmentAcceptance.test.ts
```

Focused model/business result on 2026-10-10: 28 passed, zero failed. Coverage includes price boundaries, catalog identity, zero/null JSON round-trips, market exclusion/discontinuation, temporary-stock independence, duplicate dates, matched price bases, missing-price lower bounds, group-capacity scope, absence of optional amenities and shadow outcomes. The combined model/business/refresh/API command passed 43 tests; five executable API tests check actual tenant-scoped queries, direct rating sorting, exact period/calibration provenance, JSON/CSV zero-versus-null, suppression and bounded export behavior.

Tests immediately below/at/above 12, 24, 60, 120 and 240 equivalents/month demonstrate intentional adjacent tier changes. The six-equivalent per-product floor excludes shallow variety while retaining a strong core. Frequency cannot rescue tiny quantity. Price tests cover 0.60/1.25 inclusive and just-outside values.

Operational persistence, actual API/UI, tenant security, full tests, typecheck/build, recalculation and deployment results belong in the current 0.2 release validation record; focused model tests do not claim those gates.

## Future calibration procedure

1. Freeze version, tenant inclusion/prices, source revision, represented dates and full comparison population.
2. Dry-run current/proposed stars, null/ineligible counts and explained transitions. Keep account exports private.
3. Inspect broad/shallow, deep-core, premium niche, missing-attribute and research-only examples. Explain surprising results.
4. Compare the lower tail with the absolute floor and approximate bottom-30% focus goal. Never force exact zero percentages or equal star buckets.
5. Perturb price/volume boundaries, especially short windows and meaningful niches.
6. Increment calibration version for threshold changes and rerun acceptance/security/persistence tests and population comparisons.
7. Retain historical snapshots/outcomes; conversion learning remains excluded.

## Final Echo TST comparison (2026-10-10)

The final persisted Echo assessment population contains 15,386 accounts, with historical comparison evidence for all 15,386. The current evidence modes are 12,184 sales-backed and 3,202 research-based. The sales foundation is September 9–26, 18 complete represented days. Calculation dates are later than this sales period; they must not be presented as additional sales coverage.

| Current rating | Echo accounts |
| --- | ---: |
| 0 | 5,430 |
| 1 | 1,122 |
| 2 | 1,663 |
| 3 | 943 |
| 4 | 287 |
| 5 | 57 |
| null | 5,884 |
| **Total** | **15,386** |

There are 9,502 rated accounts. Zero represents 57.15% of the rated comparison population (35.29% of all accounts), rather than a forced 30% quota. The 5,884 null ratings comprise 5,883 UNRATED assessments and one INELIGIBLE assessment. Missing evidence is not included in the commercially unsuitable zero bucket.

There were no legacy scores at or above 70 in the historical comparison; the new model identifies 344 accounts at four or five stars. This is not a claim of improved conversion: legacy scores mixed product opportunities, feasibility and strategy and can reflect a different sales window. Stars answer the new commercial question. Examples from the stable hash-selected, anonymized comparison include historical 14.4 becoming two stars (51.7 compatible equivalents/30 days, leading 26.7, core 46.7), historical 43.8 also becoming two stars (58.9 compatible, leading/core 53.3), and historical 12.7 becoming Unrated because missing attributes could change an otherwise zero result. These distinct transitions demonstrate that no score/20 conversion is used.

Among rated accounts with a non-null compatible-volume measure, p10/p30/p50 equal zero, p90 is 86.1 and p99 is 240.6 equivalents per 30 represented days. These quantiles include rated zeroes and exclude Unrated accounts; they are context, not dynamic rating cutoffs. The earlier all-product raw-bottle percentiles and preliminary dry-run stars are not the final commercial distribution. In particular, the final missing-attribute safeguard moves uncertain apparent zeroes to Unrated without altering their stored purchasing quantities.

## Authorized named records versus synthetic archetypes

These are limited checks of authorized TST records, not audited complete histories or private account exports. The named synthetic acceptance cases above remain separate from these real records.

| Actual TST record | Historical numeric value (audit only) | Current result | Explanation |
| --- | ---: | --- | --- |
| Denmark on High | 0 | Unrated | Known compatible rate 4.9 equivalents/30, leading 3.3, core 0 in the 18-day foundation. Essential missing product attributes could change the minimum tier, so the system cannot establish a true zero. The fully attributed synthetic 36-bottle shallow case still rates zero. |
| Giuseppe’s Ritrovo Bexley | 26.8 | 1 star | Compatible rate 31.7, leading 11.7, core 26.1 and recurring core 0. Leading depth remains below the two-star minimum of 12, regardless of respectable aggregate volume. |
| Columbus Zoo | 0 | Unrated | Sales identity is ambiguous and usable current research is insufficient. No identity data was changed to force a result. The synthetic seasonal venue with verified substantial suitable purchasing can still earn five. |

The staging tenant has 15,386 null ratings because it has no included portfolio with which to establish current commercial fit; no synthetic portfolio was introduced to produce a distribution. Its one ineligible account remains separately classified rather than confused with missing portfolio evidence.

## Final MWS TST comparison and whole-run verification

MWS was recalculated against the same 15,386-account population and 18-day certified sales foundation, using its own included market portfolio and prices. It has 12,184 sales-backed and 3,202 research-based assessments, and historical comparison evidence for every account.

| Current rating | MWS accounts |
| --- | ---: |
| 0 | 6,059 |
| 1 | 1,207 |
| 2 | 1,569 |
| 3 | 702 |
| 4 | 198 |
| 5 | 38 |
| null | 5,613 |
| **Total** | **15,386** |

MWS has 9,773 rated accounts; zero is 62.00% of that rated population. Null consists of 5,612 UNRATED and one INELIGIBLE assessment. Four/five stars identify 236 accounts, versus no historical legacy values at or above 70. Among rated accounts with a compatible-volume measure, p10/p30/p50 are zero, p90 is 71.1 and p99 is 211.1 equivalents per 30 represented days.

A stable sampled location demonstrates tenant-specific fit: its historical value was 43.8 for both tenants. Echo now has 58.9 compatible equivalents/30 and core 53.3, giving two stars; MWS has 67.8 compatible and core 60.0, giving three. Leading product depth is 53.3 for both. The extra portfolio-compatible core meets the three-star threshold for MWS; relationship, assignment and pursuit state do not enter this comparison. The location is intentionally anonymous and no private record export is committed.

The final full runs for Echo, MWS and staging all completed: each had 15,386 expected, evaluated, persisted and fresh current assessments, with 15,386 corresponding run snapshots, zero skipped, zero failed and one ineligible. Across the three tenants this verifies 46,158 actual persisted current assessments, including zero, unrated, no-purchase, no-pursuit and controlled-pursuit states. Independent research, pursuit, task and preference fingerprints were unchanged by recalculation. Exact run IDs, repeat-run evidence, checks and deployment details are retained in the 0.2 delivery validation record.
