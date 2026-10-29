# Integration acceptance

Use [focused tests during editing](testing-strategy.md). Run `npm test`, `npm run typecheck`, `npm run build`, applicable Prisma checks and `git diff --check` for completed application changes and release candidates. Provider tests inject responses; they never prove live consent or external delivery.

Use a verified isolated child of TST with `APP_ENV=development`, `CRM_REHEARSAL=true`, `DATABASE_TARGET_ID=crm-isolated-rehearsal`, a private child-host environment loader, and external side effects disabled. Never print the connection string or generated session token. Apply only the exact CRM additive migrations; preserve unrelated historical migration-ledger gaps.

Run the guarded scripts in order when preparing fresh fixtures:

1. `scripts/crm-rehearsal.ts` — tenant/private isolation, contacts, manual activity/history and canonical plans; creates ignored fixture/session metadata.
2. `scripts/crm-playbooks-rehearsal.ts` — concurrent starts and cancellation preservation.
3. `scripts/crm-events-rehearsal.ts` — staff conflict, tenant denial, idempotency, versions and coverage.
4. `scripts/crm-field-profile-rehearsal.ts` — typed profiles, geography, parent-cycle/removal guards and route versions/ownership.
5. `scripts/crm-final-rehearsal.ts` — canonical Pipeline reopening and operations reporting.

Communications/mailbox/SMS/AI and Recipe acceptance steps were retired with their runtime features; their deleted scripts must not be part of new acceptance plans. Stored records and the tests guarding their preservation remain.

For database-backed browser acceptance, start the optimized build at localhost:3102 against that child. The retained `crm-browser-acceptance.ts`, `crm-extensions-browser.ts` and `crm-final-fields-browser.ts` cover canonical navigation, accounts/visits/Pipeline, health settings, playbooks, events, profiles/documents and reporting. Review their fixtures and selectors against the current UI before use; these historical multi-tenant fixtures do not establish fresh Echo-only login acceptance. `scripts/field-workspace-browser.ts` provides the current component-fixture checks at 390x844 and 1440x900 without a live app-user session. Screenshots remain ignored under output/playwright.

Repeat database runs need fresh fixtures. Do not create a shared-TST admin session without explicit authorization. Stop local servers before Prisma regeneration on Windows. Preserve the isolated branch until acceptance evidence is complete, then remove it through the normal branch lifecycle when no longer needed.

Live Worklist calendar-provider behavior, Eventbrite account access and road-routing quality remain separate integration acceptance. Browser emulation does not prove real-device offline synchronization, accessibility certification or production capacity.
