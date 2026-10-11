# Integration architecture

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Existing Google Calendar connects a user to Worklist events; this is not Gmail ingestion. Ohio integrations import shared directories and supplier-specific sales/inventory. Mailbox integrations use separately authorized Google/Microsoft connections, normalized changes, private visibility by default and persisted cursors. SMS and Eventbrite are not yet integrated. Never describe adapters or fixture tests as live provider verification.

## Implementation references

- `lib/calendar`
- `lib/marketDataProvider.ts`
- `lib/ohlqAnnualSalesWorkflow.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Implemented mailbox adapters

`lib/crm/mail/types.ts` defines normalized pages/cursors/errors; google.ts, microsoft.ts and mock.ts implement it. oauth.ts manages consent/PKCE/refresh; sync.ts performs lease-protected ingestion. Provider transport is fixture-tested; live activation remains unverified. See [setup and precise limitations](../engineering/integration-setup.md).
