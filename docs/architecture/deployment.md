# Deployment architecture

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

staging points to echospirits/neat-tst and tst deploys the test application. origin/main is production and requires a separate explicit promotion. Validate environment identity and database target before migration or rollout. Apply additive schema before code that queries it. Existing release tags include historical v0.2 artifacts; do not replace them.

## Implementation references

- `docs/RELEASE_PROCESS.md`
- `docs/releases/RELEASE_CHECKLIST.md`
- `lib/appEnvironment.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
