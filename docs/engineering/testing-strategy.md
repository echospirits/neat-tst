# Testing strategy

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

npm test uses node:test through tsx and tests/setup.ts disables external side effects. Add behavior tests for matching, deduplication, privacy, tenant scope, state transitions and provider retries. Use a disposable database for persistence verification and Playwright for browser behavior. Source-only assertions do not prove database or browser behavior.

## Implementation references

- `package.json`
- `tests/setup.ts`
- `docs/releases/v0.2-test-report.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
