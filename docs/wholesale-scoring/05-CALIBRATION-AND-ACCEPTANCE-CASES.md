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

Final verified star distributions and old-to-new transitions are appended after the full TST run. Raw pre-fit percentiles above are not a substitute for that result.
