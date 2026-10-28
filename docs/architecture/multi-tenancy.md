# Multi-tenancy

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Normal users have one User.organizationId. Platform administrators explicitly select Support View. There is no general multiple-organization membership system yet. Private queries must include organizationId, including exports, jobs, matching and AI retrieval. Tenant administrators cannot curate global account data. Support View does not authorize reading another user’s private mailbox.

## Echo-only transition — October 28, 2026 (TST)

The owner has authorized an incremental return to Echo-only operation. The first delivery limits interactive identity and organization context to Echo; Support View cookies cannot change that context. Existing organization identifiers and private-record filters remain in place to preserve ownership and prevent archived outside records from entering Echo's workflows.

This first step does not remove provisioning/platform screens, modify background dispatchers, disconnect providers, delete outside organizations or reassign their records. Those are separate reviewed increments. Historical architecture above describes the earlier platform; [current transition validation](../releases/echo-only-transition-validation.md) records the delivered boundary and remaining work.

## Implementation references

- `lib/organizations.ts`
- `lib/userAccess.ts`
- `tests/multiTenantFoundation.test.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
