# Multi-tenancy

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Normal users have one User.organizationId. Platform administrators explicitly select Support View. There is no general multiple-organization membership system yet. Private queries must include organizationId, including exports, jobs, matching and AI retrieval. Tenant administrators cannot curate global account data. Support View does not authorize reading another user’s private mailbox.

## Implementation references

- `lib/organizations.ts`
- `lib/userAccess.ts`
- `tests/multiTenantFoundation.test.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
