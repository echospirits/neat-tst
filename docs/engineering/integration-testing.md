# Integration acceptance

Run `npm test`, `npx tsc --noEmit`, `npm run build`, Prisma validation and `git diff --check`. Provider tests inject responses; they never prove live consent or external delivery.

Use a verified isolated child of TST with `APP_ENV=development`, `CRM_REHEARSAL=true`, `DATABASE_TARGET_ID=crm-isolated-rehearsal`, a private child-host environment loader, and external side effects disabled. Never print the connection string or generated session token. Apply only the exact CRM additive migrations; preserve unrelated historical migration-ledger gaps.

Run the guarded scripts in order when preparing fresh fixtures:

1. `scripts/crm-rehearsal.ts` — tenant/private isolation, contacts, ingestion, canonical plans and OAuth races; creates ignored fixture/session metadata.
2. `scripts/crm-sms-rehearsal.ts` — signed callbacks, consent, STOP, replay and ambiguous-send behavior.
3. `scripts/crm-playbooks-rehearsal.ts` — concurrent starts and cancellation preservation.
4. `scripts/crm-recipes-rehearsal.ts` — costs, approval, private/public boundaries and revocation.
5. `scripts/crm-events-rehearsal.ts` — staff conflict, tenant denial, idempotency, versions and coverage.
6. `scripts/crm-field-profile-rehearsal.ts` — typed profiles, geography, parent-cycle/removal guards and route versions/ownership.
7. `scripts/crm-final-rehearsal.ts` — complete rescan absence reconciliation, AI evidence privacy and canonical Pipeline reopening.

Start the optimized build at localhost:3102 against that child. `crm-browser-acceptance.ts` verifies canonical redirects, responsive account/Pipeline/Log Visit/Communications, private conversation saves and mock matching. `crm-extensions-browser.ts` covers recipes, approval/public privacy, playbook Worklist, SMS/STOP and scheduled events. The final-fields browser script adds profiles, documents, guides/draft recovery, filtered history, detailed Pipeline, reviewed assistant and reporting. Screenshots remain ignored under output/playwright.

Repeat runs need fresh fixtures or explicitly restored mock SMS consent; STOP intentionally persists. No shared-TST admin session is created. Stop local servers before Prisma regeneration on Windows. Preserve the isolated branch until acceptance evidence is complete, then remove it through the normal branch lifecycle when no longer needed.

Live Google/Microsoft OAuth, Twilio carrier delivery/registration, Eventbrite account access, road-routing quality and AI model quality remain separate activation acceptance. Browser emulation does not prove real-device offline synchronization, accessibility certification or production capacity.
