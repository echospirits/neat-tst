# Events and tastings

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Tasting visits and event-related legacy models exist, but a full event-management workspace, Eventbrite adapter, attendance/cost management and staff scheduling are not complete. Before/after comparisons must state the window, data coverage and confounders; they cannot establish causality.

## Implementation references

- `prisma/schema.prisma`
- `app/visits`
- `lib/visitWorkflow.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
