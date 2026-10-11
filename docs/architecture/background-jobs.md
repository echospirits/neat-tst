# Background jobs

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Current infrastructure includes Vercel cron routes, Workflow workflows and scheduled GitHub Actions. Calendar sync has connection locking; account research has persisted jobs. For mailbox ingestion, cursor advancement must commit with activity writes, use a lease, and preserve a retryable checkpoint on partial failures. A successful cron response alone is not evidence a provider change arrived.

## Implementation references

- `lib/calendar/syncLock.ts`
- `lib/calendar/worklistSync.ts`
- `app/api/cron`
- `lib/accountResearchDailyWorkflow.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Implemented mailbox worker

`app/api/cron/communications/route.ts` requires a constant-time CRON_SECRET check, existing cron side-effect gate and CRM_MAIL_ENABLED. It selects two eligible connections in updated-time order, with active organization/user/Core CRM predicates; sync revalidates membership and the lease. It processes one page per connection. It is not registered in vercel.json, so live scheduling is an explicit activation step. Metadata/cursor/retention are committed together. Gmail reads at most twenty metadata messages in batches of four. Missing adaptive backoff, standalone retention cleanup and capacity monitoring remain recorded in integration setup.
