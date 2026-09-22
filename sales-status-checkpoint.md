# Account Sales Status / Pipeline checkpoint

## Current checkpoint

8. Complete. Original feature deployed at 9c6afd2b; staging entitlement policy completed and pushed at a65695f4; stage-arrow and Kanban follow-up deployed at 8fca96ff; compact wholesale progress and direct actions deployed at bcecf92f and reviewed in the authenticated staging browser.

## Key decisions

- Reuse `OrganizationAccountOverlay` for tenant-private current status and the existing assigned user.
- Store immutable transitions in `AccountSalesStatusHistory`; sales-data events carry an organization-scoped idempotency key.
- Keep generic `AGENCY` / `WHOLESALE` account identities in the core feature; Ohio-specific purchase lookup stays in an adapter.
- `ACCOUNT_SALES_STATUS` is optional and default-disabled. Echo is enabled by the existing ID-based bootstrap list.
- In APP_ENV=test, all tenants receive every registered feature; production defaults and role/tenant authorization remain unchanged. Persisted staging entitlements were verified for all three tenants (17 each).
- Six forward-stage arrows share colors with Kanban. Nurture/Lost are separate outcomes. List and board preserve status filters; board cards open account pages without drag-and-drop mutations.

## Material files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260922120000_account_sales_status/migration.sql`
- `lib/featureRegistry.ts`
- `lib/accountSalesStatus.ts`, `lib/accountSalesEvents.ts`, `lib/ohlqAnnualSalesWorkflow.ts`
- `app/account-sales-status/actions.ts`, `app/components/AccountSalesStatusPanel.tsx`
- `app/agencies/[id]/page.tsx`, `app/wholesale/[id]/page.tsx`
- `app/visits/new/page.tsx`, `app/visits/LogVisitForm.tsx`, `app/visits/actions.ts`
- `app/pipeline/page.tsx`, `app/components/navigationConfig.ts`, `app/redesign.css`
- Follow-up: `app/components/SalesStatusJourney.tsx`, `app/components/salesStatus.css`, staging entitlement/provisioning code and `scripts/enable-all-staging-features.ts`.
- `tests/accountSalesStatus.test.ts` and affected entitlement/navigation tests

## Tests

- Focused Account Sales Status and adjacent UI tests: 40/40 passed.
- Full suite: 473/473 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with development resource labels; sandboxed Workflow resolution required the standard unrestricted retry.
- TST schema postflight: history table, overlay columns, and Echo entitlement confirmed on `neon-neat-tst`.
- Staging policy recovery: 475 tests passed; typecheck and build passed.
- Arrow/Kanban follow-up: 30 focused tests, typecheck, and build passed. Live browser reviewed at 1440 x 900 and 390 x 844: stage selection, account context, eight board columns, matching list/count/card totals, filter persistence, empty status recovery, Agency and Wholesale panels, and mobile document width within viewport. No account data was mutated during the visual review.
- Wholesale compact-progress follow-up: 7 focused tests, typecheck, build, and live 1440 x 900 / 390 x 844 review passed. Mobile status area reduced from 546px to 164px (24px arrow strip). Confirmed color through Interested with later stages gray, no current outline, direct Edit, no More actions/Voice note shortcut, and no horizontal page overflow. Existing Merge authorization preserved. No account data mutated.

## Remaining work

- Pipeline disclosure follow-up implemented in `app/pipeline/page.tsx`, `SalesStatusJourney.tsx`, and `salesStatus.css`; regression coverage added to `tests/accountSalesStatus.test.ts`. Kanban default, initially collapsed native status groups, raised icon-bearing filters, and view-preserving clear filters. 8 focused tests and typecheck passed; build, staging publication, and responsive review pending.
- No feature work remains. Staging deployment Ready; health identifies `neon-neat-tst` / `test`.
- Existing unrelated `20260917120000_agency_store_context` migration-history discrepancy remains documented, not modified. No production promotion or numbered release bump.
