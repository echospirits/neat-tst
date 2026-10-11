# Automation engine

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Existing deterministic opportunity detection and wholesale reactivation produce recommended actions and Worklist items. Preserve source links and idempotency keys. User-configurable playbooks, generalized rule authoring and a generic durable queue are not yet implemented. No automation may send customer messages without explicit authorization.

## Implementation references

- `lib/opportunityEngine.ts`
- `lib/ohlqWholesaleReactivation.ts`
- `lib/visitWorkflow.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
