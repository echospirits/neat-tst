# Sales intelligence

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Existing agency intelligence, wholesale commercial-star assessments, reorder/retention signals and account research provide evidence-backed prioritization. Coverage and freshness remain visible. The new relationship briefing combines visible activity with open commitments; missing purchasing data must remain unknown.

## Implementation references

- `lib/wholesaleAssessment.ts`
- `lib/agencyIntelligence.ts`
- `lib/opportunityEngine.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Implemented relationship briefing

`lib/crm/briefing.ts` produces deterministic attention reasons from visible meaningful-contact recency, active contact coverage and open overdue Worklist commitments. It separates physical visits from communication and excludes future activity when computing recency. Default recency threshold is thirty days. The UI shows canonical follow-up/visit actions and account-specific deals/work links. This is not a complete configurable purchasing-health score: no last-purchase/trend/inventory summary or graph is added here. Displayed work/deal reads are bounded to 50/20; large-account aggregation requires further work.
