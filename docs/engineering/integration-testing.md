# Integration testing

## Provider fixtures

Run `npm test` for the existing suite plus CRM domain and mail-adapter fixtures. Adapter tests inject fetch and assert metadata pagination, cursor recovery, deletion/private exclusions, provider-safe errors and Graph continuation URL allowlisting. Fixtures do not call Google/Microsoft or prove provider consent/verification.

## Real database rehearsal

1. Create a temporary isolated child of verified TST. Record project/parent/child identity privately. Do not use production or the shared TST branch for fixture users.
2. Inject a child DATABASE_URL through a private environment loader; verify its hostname against the child endpoint before execution. Keep DATABASE_ENVIRONMENT consistent with APP_ENV. Set `APP_ENV=development`, `DATABASE_TARGET_ID=crm-isolated-rehearsal`, `CRM_REHEARSAL=true`; disable outbound email, uploads, imports, cron and live mailbox reads.
3. Apply the exact additive CRM migration after inspecting migration history. Do not blindly deploy unrelated pending historical migrations.
4. Run `node --import tsx scripts/crm-rehearsal.ts`. It creates synthetic organizations/users/contact/activity/deal fixtures, tests foreign-tenant denial/private visibility/replay/correction preservation, optimistic deal transitions, sync lease/checkpoint and OAuth ownership/replay/encryption/disconnect race. OAuth HTTP responses are injected fixtures.
5. The script writes ignored `output/crm-rehearsal.json` with a short-lived synthetic session for browser acceptance. This contains a credential: never commit or print it. Delete the isolated child after acceptance evidence is retained and no continuation needs it.

## Browser acceptance

Start the actual app against that isolated database at `http://127.0.0.1:3102`. Run `node --import tsx scripts/crm-browser-acceptance.ts` with installed Chrome. The script verifies signed-out redirect, activity/deal/communications routes at 390×844 and 1440×900, no page overflow, successful consecutive activity saves, private selection, empty filter, deal creation/loss validation and fixture synchronization/review. Screenshots and JSON are ignored under `output/playwright`.

Use the optimized build for final acceptance when possible. Stop local servers before Windows Prisma regeneration to avoid DLL locks. No temporary shared-TST administrative login is required.

## Coverage gaps

The new browser script is focused acceptance, not the entire requested regression matrix. It does not prove live mailbox OAuth, provider refresh policies, all existing visit/contact/admin/import workflows, real low-bandwidth/offline behavior, SMS, events, recipes or the unimplemented features. Expand it as each vertical becomes functional.
