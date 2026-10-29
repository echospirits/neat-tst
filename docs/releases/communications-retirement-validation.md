# Communications retirement validation — 0.4.0

Owner requested Communications removal and then explicitly authorized pushing this change to main on October 28, 2026. Scope is limited to that removal and its release packaging.

## Baseline and data safety

- Refreshed production `origin/main` is `438b1ae1`, version 0.3.0. Refreshed TST `staging/tst` is `1a293eab`, version 0.3.0; their complete trees match despite divergent histories.
- No schema or historical migration changes. Existing Contacts, AccountActivity history, mailbox/token storage, business SMS and consent/opt-out/review records remain intact. No database/provider/account/configuration mutations are needed or performed for retirement.
- Removed Communications UI/actions/OAuth/sync/cron, business SMS/callbacks, contact suggestions, the communication assistant/AI setting and exclusive matching/adapters. Deleted obsolete provider scripts/tests while retaining the shared CRM portions of mixed acceptance scripts. Removed Twilio plus 27 exclusive transitive packages; no retained dependency version changed.
- Old COMMUNICATIONS entitlement rows are filtered from feature lists and rejected by direct feature checks. Ordinary contacts/manual interaction entry, account history/briefing, Worklist/calendar, events, Pipeline and their authorization remain.

## Completed checks

- Clean `npm ci --no-audit --no-fund` succeeds (612 installed packages, Prisma generation succeeds).
- 873 tests / 75 suites pass with zero failures/skips/cancellations, including 42 focused retirement/navigation/Core/health/contact/background regressions and retained Echo isolation, Worklist/calendar and activity semantics.
- Prisma schema validation succeeds; schema/migrations diff is empty.
- Actual navigation, AccountMemoryPanel/ContactImportForm and AccountBriefing fixture renders pass in Chrome at 390x844 and 1440x900. Empty/populated contact states, edit/add/import and briefing disclosures, mailto/tel/context preservation and mobile More pass without document overflow or browser exceptions. Screenshots reviewed visually. Fixture actions/identity/evidence are synthetic; no authenticated shared-TST session, provider traffic, hydrated form submission or live mailbox test is claimed. Removed modules have no loading/error/disabled/success UI left to exercise.
- React review: shared UI controls and their context remain; removing the assistant also removes its organization-settings database query and client bundle. Shared action-result typing moved into a domain type module; retained server actions preserve authentication.
- `git diff --check` passes.

## Candidate gates

The first local optimized compilation succeeded, but typechecking scanned 2,143 existing scratch TypeScript files under ignored/untracked output/tmp. They are unrelated to the candidate and were preserved. Full validation is therefore run from a clean export of the exact candidate files using the existing dependency install, without those scratch files or environment secrets. The initial sandbox-only compilation also needed the existing Workflow compiler's directory access; no compiler/configuration workaround ships.

Clean-export stable 0.4.0 validation passes: 873 tests / 75 suites, standalone typecheck and optimized Next 16.3.8 build. Runtime/configuration/dependency files are byte-identical to the tested export. The generated route manifest contains no Communications/mailbox/SMS/communications-cron paths and retains Calendar and Log Visit. Node 22/npm 10 GitHub dependency check, TST READY/health and production READY/health/route verification remain pending and must be bound to the final candidate SHA/tree before claiming release success. Promotion must use one exact-tree, single-parent commit from the refreshed production baseline. Do not replay migrations. Hosted provider-secret revocation or external scheduler/webhook cleanup, if any exists, remains separate operator work.
