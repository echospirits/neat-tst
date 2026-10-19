# Evidence and data rules

## Sales precedence and periods

Reliable observed purchasing takes precedence over public research. A prospect may have complete market data despite never buying from the tenant. Customer/prospect labels and state alone do not establish source availability.

The OHLQ adapter processes daily exports with identical requested From/To dates. It does not sum overlapping cumulative reports. Completed source revision plus corresponding tenant ledger certification establishes a represented date. Zero account purchases on a covered day is different from an unavailable source day.

Within the effective latest 90 calendar days, select the longest contiguous certified block; ties choose the newest end date. Source metadata, never the first account purchase, determines the period. Accounts sharing a source use the same foundation. A complete 18- or 30-day block carries no generic penalty or star ceiling.

Use that block’s actual dates/duration. When it ends before the newest source day, show its actual earlier end. Latest and previous 30-calendar-day totals are supporting context, with covered-day counts; gapped context is not labeled complete and does not replace the complete foundation.

On 2026-10-10 TST’s longest complete recent block was September 9–26 (18 days); newer shorter blocks existed. The limitation must remain visible. No summer or short-window rate becomes annual demand. Compatibility observation fields named bottles30/60/90 are subwindows of the selected foundation, not annual totals. Coverage dates and `commercial.representedDays` define their interpretation.

## Quantities, identity and timing

- 750 ml equivalents = recorded bottles × liters ÷ 0.75.
- Per-30-day rate = equivalents × 30 ÷ represented days.
- Catalog item code is the aggregation identity; catalog name/category overrides import display wording.
- OHLQ catalog volume retains the established fluid-ounce conversion in `catalogLiters`.
- Positive purchase dates are deduplicated. Several lines on one date are one date.
- A recurring product has at least two positive dates separated by seven days. This indicates purchase persistence, not measured consumption or exact replenishment frequency.
- Missing timing never invents reorders. Exceptionally deep single orders can satisfy the explicit sales-matrix alternative.
- Same-date corrected reports replace the dated ledger revision instead of adding it again.

## Price and missing attributes

Normalize both price and quantity to 750 ml. Prefer published wholesale price when both compared products have it. Otherwise use both retail catalog prices, labeled as positioning proxies. Do not compare wholesale on one side with retail on the other. Out-of-Ohio portfolio fallback uses catalog retail positioning because applicable local wholesale pricing is not established. Catalog prices are not invoice costs or tenant revenue.

Preserve category/style distinctions: rum styles, specific cordials and whiskey subtypes are not blanket substitutes. Unknown essential style stays missing evidence. RTDs are not base spirits. Bourbon, Rye, Irish and Canadian remain separate categories; unknown generic rum/cordial/Scotch/American-whiskey comparisons are conservatively unresolved.

Missing identity, style, size or price does not erase quantity or downgrade source coverage. Known compatible streams establish a positive lower-bound tier, with explicit limitations for excluded attributes. If essential missing attributes could lift an otherwise zero result, return Unrated rather than zero, even when a small known comparable stream exists. An exact catalog item identity establishes matching style without requiring a duplicate style attribute.

## Saved research

Use persisted exact-location evidence with provenance and valid current research/evidence dates within 180 days. Wrong-location, stale and explicitly historical claims cannot establish current fit. Calculation timestamps remain separate from research timestamps.

Exact catalog names in sourced menu claims or explicitly named menu pours can establish price positioning. The conservative matcher does not invent brand aliases. A drink price does not establish bottle cost or a pour-cost budget. Unresolved identities/prices remain visible limitations.

Use the largest valid review-platform count, never their sum. Group capacity is not assigned to every location. Local ownership does not establish craft affinity. A value vodka placement supports only its actual product/category/price positioning.

## Failure and freshness

Source failures belong in ingestion/run health. Preserve prior valid assessments on a failed current source refresh. Incomplete scoring records actual expected/evaluated/persisted/ineligible/failed counts and is not a successful complete refresh. Historical backfills cannot move current effective dates backward. Capture raw report evidence into the revisioned ledger before retention pruning.
