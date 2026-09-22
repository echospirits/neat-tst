# Account Sales Status / Pipeline checkpoint

## Current checkpoint

8. Release manifest — complete; deployed browser review pending push

## Key decisions

- Reuse `OrganizationAccountOverlay` for tenant-private current status and the existing assigned user.
- Store immutable transitions in `AccountSalesStatusHistory`; sales-data events carry an organization-scoped idempotency key.
- Keep generic `AGENCY` / `WHOLESALE` account identities in the core feature; Ohio-specific purchase lookup stays in an adapter.
- `ACCOUNT_SALES_STATUS` is optional and default-disabled. Echo is enabled by the existing ID-based bootstrap list.

## Material files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260922120000_account_sales_status/migration.sql`
- `lib/featureRegistry.ts`
- `lib/accountSalesStatus.ts`, `lib/accountSalesEvents.ts`, `lib/ohlqAnnualSalesWorkflow.ts`
- `app/account-sales-status/actions.ts`, `app/components/AccountSalesStatusPanel.tsx`
- `app/agencies/[id]/page.tsx`, `app/wholesale/[id]/page.tsx`
- `app/visits/new/page.tsx`, `app/visits/LogVisitForm.tsx`, `app/visits/actions.ts`
- `app/pipeline/page.tsx`, `app/components/navigationConfig.ts`, `app/redesign.css`
- `tests/accountSalesStatus.test.ts` and affected entitlement/navigation tests

## Tests

- Focused Account Sales Status and adjacent UI tests: 40/40 passed.
- Full suite: 473/473 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with development resource labels; sandboxed Workflow resolution required the standard unrestricted retry.
- TST schema postflight: history table, overlay columns, and Echo entitlement confirmed on `neon-neat-tst`.

## Remaining work

- Push to `staging/tst`, wait for deployment, and visually review 390 x 844 plus desktop.
- Verify staging health and report the existing unrelated `20260917120000_agency_store_context` migration-history discrepancy.
