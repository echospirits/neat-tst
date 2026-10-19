# Architecture principles

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Preserve working workflows and external identifiers. Resolve organization and user authority on the server. Require deterministic, idempotent writes and explicit external side-effect gates. Keep observations, provider evidence, manual assertions and AI suggestions distinguishable. Worklist owns follow-ups. Domain-specific acquisition stays behind provider boundaries.

## Implementation references

- `lib/organizations.ts`
- `lib/appEnvironment.ts`
- `lib/marketDataProvider.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
