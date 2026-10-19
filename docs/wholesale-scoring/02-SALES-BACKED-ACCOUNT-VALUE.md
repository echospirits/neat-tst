# Sales-backed account value

Implementation: `lib/wholesaleAssessment.ts`. Calibration: `COMMERCIAL_2026_10_V1`. Numerical boundaries are provisional implementation heuristics, not consultant weights or validated conversion probabilities.

## Compatible products and prices

Use the included active, non-discontinued market portfolio. Buyer routes, transient stock, strategic role and strategic numeric priority do not change stars.

A purchased product is compatible if at least one portfolio product has matching category/style and:

```text
0.60 <= tenant normalized price / purchased-product normalized price <= 1.25
```

Both bounds are inclusive. The upper bound tolerates at most a 25% upward price difference. The lower bound avoids treating a much cheaper offer as equivalent to an ultra-premium program, while allowing moderately lower-priced positioning.

These are reviewable positioning tolerances, not switching probabilities. They replace the old 75–175% purchased-price band. Tenant $25 versus observed $20 qualifies; $25.01 does not. Tenant $12 versus observed $20 qualifies; $11.99 does not. A $30 portfolio cannot borrow the volume of $10 products.

Use paired wholesale prices, otherwise paired retail proxies. Include each purchased quantity once, regardless of how many tenant products match. Adding an equivalent duplicate portfolio SKU cannot inflate volume or stars.

## Product-depth measures

Let q_i be purchased 750 ml equivalents in the selected complete D-day period:

```text
v_i = q_i × 30 / D
compatible volume = sum(v_i for compatible products)
core = compatible products with v_i >= 6
C = sum(v_i in core)
L = maximum v_i, or zero
R = sum(v_i in core with >=2 positive purchase dates spanning >=7 days)
```

All thresholds below use 750 ml equivalents per 30 represented days. There is no average-volume-per-SKU penalty and no small saturation cap. Slow assortment does not conceal a strong core. A tenant needs only one meaningful compatible product stream.

## Highest satisfied whole tier

| Stars | Leading L at least | Core C at least | Additional condition |
| --- | ---: | ---: | --- |
| 0 | — | — | No higher tier met |
| 1 | 6 | 12 | None |
| 2 | 12 | 24 | None |
| 3 | 24 | 60 | None |
| 4 | 48 | 120 | R >= 60, or L >= 240 |
| 5 | 96 | 240 | R >= 120, or L >= 480 |

Public research cannot raise a sales-backed result. Frequency is not an additive bonus. For high tiers, repeated dates substantiate persistence; the alternative recognizes very substantial single-order business without inventing reorders. One recurring 240-equivalent monthly stream earns five. The same quantity on one date earns four. One 480-equivalent stream can earn five with unknown timing.

Use unrounded measures for comparisons; display measures round to one decimal only afterward. There is no historic-score ordering or changing percentile curve. Filters, assignment, territory and search radius cannot change the result.

## Worked cases

| Synthetic case | Calculation | Stars |
| --- | --- | ---: |
| 36/month scattered, leader 5 | L=5; C=0 | 0 |
| 240/month across 80 products at 3 | L=3; C=0 | 0 |
| Same 240 across two recurring products at 120 | L=120; C=240; R=240 | 5 |
| Same core plus 100 products at 1 | Core unchanged | 5 |
| 1,000 cheap + 60 compatible premium, premium tenant | L=C=R=60; cheap volume excluded | 3 |
| Single concentrated 3/month | L=3; C=0 | 0 |
| Complete 30 days at 240, versus 90 days at 720 | Both rate 240 | 5 |
| Established tenant customer at recurring 240/month | Tenant purchasing counts fully | 5 |

A seasonal/institutional venue may earn five from substantial suitable purchases despite unknown access. Only its actual represented season is described; no annual forecast is generated.

## Rationale and sensitivity

Six equivalents per product is approximately a six-bottle case per 30 represented days. The twelve-equivalent account floor prevents a single marginal movement from automatically becoming proactive business. Higher tiers require substantial core plus individual depth. Short complete windows are normalized fairly but remain sensitive to individual orders; the limitation is explicit.

Unrounded near-boundary tests exercise 11.99/12/12.01, 23.99/24, 59.99/60, 119.99/120 and 239.99/240. Real commercial changes can move a tier; there is no hidden stale-rating smoothing. Changes to thresholds require a new calibration version and renewed population/acceptance comparison.
