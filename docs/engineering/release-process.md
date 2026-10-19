# Engineering release process

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Follow docs/RELEASE_PROCESS.md and the standard checklist. Feature work ends tested, documented, committed and pushed to staging/tst. Freeze a candidate only after all required gates. Version 0.2.0 already exists historically: use 0.2.3-dev for this requested extended release lineage and do not overwrite historical tags. No stable release is claimed during implementation.

## Implementation references

- `docs/RELEASE_PROCESS.md`
- `docs/releases/v0.2-plan.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
