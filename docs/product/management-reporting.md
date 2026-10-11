# Management reporting

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Analytics and CSV exports, user activity and opportunity performance exist. Separate usage/activity counts from sales outcomes. Weighted deal forecasts will be estimates based on user-entered revenue and probability, not observed sales. Every new KPI needs a defined numerator, denominator, period, null policy and provenance.

## Implementation references

- `app/analytics`
- `lib/analytics`
- `lib/userActivityReport.ts`
- `app/admin/opportunity-performance`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Added estimate

Deals adds a bounded open-pursuit forecast: recorded USD cents summed and multiplied by each probability, rounded per deal. Missing value is counted separately from zero, and closed/paused deals are excluded. This is seller-estimated pipeline, not recognized revenue or evidence of a purchase. The board cap/search narrows the estimate and is labelled. Historical conversion/forecast accuracy reports remain incomplete.
