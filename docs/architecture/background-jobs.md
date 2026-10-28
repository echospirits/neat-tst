# Background jobs

## Echo-only TST transition — October 28, 2026

The owner-authorized transition restricts scheduled organization selection and worker execution to `org_echo_spirits`. Existing active/status/feature checks, secret authentication, environment side-effect gates, leases, retries, budgets, idempotency and cron schedules remain authoritative.

- OHLQ inventory/credential reads, product discovery, forecast sources and forecast refresh select Echo. Explicit foreign targets fail before credential reads or data writes.
- Sales-status reconciliation, restaurant assessments, research-driven score refresh and retail market intelligence process Echo only. Wholesale order reconciliation reads pending/manual Echo orders; existing global evidence claims remain available to prevent reuse of a report match. Shared Account/Brand Master and raw sales reports remain shared source data.
- Automatic research owns/resumes Echo runs and uses Echo overlays, opportunities, assessments, Worklist and job history when prioritizing the shared public account directory. Existing spending/wave limits remain. Retained outside runs are not reassigned or polled.
- Calendar selection requires an active Echo user, and execution checks current membership plus active Echo status before provider access. Foreign tasks/old owners retain their event identities rather than triggering provider cleanup.
- Digest delivery requires actual Echo membership; an unassigned or outside platform administrator does not inherit Echo delivery. Mail ingestion requires Echo plus the existing Communications pilot. Retention sweeps expire Echo mailbox activities only. Outside SMS callbacks stop before credential decryption or delivery/consent mutation. Revoked Echo pilots still honor verified STOP callbacks.

No connections, credentials, flags, schedules, schema or outside data are deleted/changed by this delivery. No worker was manually triggered against live providers during validation. Existing deployment environment gates decide whether any scheduled work runs. See [incremental transition validation](../releases/echo-only-transition-validation.md). Production promotion and any outside provider disconnection/retention operation remain separate decisions.

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

`app/api/cron/communications/route.ts` requires a constant-time CRON_SECRET check, existing cron side-effect gate and CRM_MAIL_ENABLED. It selects two eligible connections in updated-time order, with active organization/user/Core CRM predicates; sync revalidates membership and the lease. It processes one page per connection. It is not registered in vercel.json, so live scheduling is an explicit activation step. Metadata/cursor/retention are committed together. Gmail reads at most twenty metadata messages in batches of four. Exponential backoff and a daily bounded disconnected-connection retention sweep are implemented. RECONNECT connections await renewed consent. Provider capacity/cadence acceptance remains an activation step.
