# Communications retirement validation — 0.4.0

Owner requested Communications removal and then explicitly authorized pushing this change to main on October 28, 2026. Scope is limited to that removal and its release packaging.

## Baseline and data safety

- Refreshed production `origin/main` is `438b1ae1`, version 0.3.0. Refreshed TST `staging/tst` is `1a293eab`, version 0.3.0; their complete trees match despite divergent histories.
- No schema or historical migration changes. Existing Contacts, AccountActivity history, mailbox/token storage, business SMS and consent/opt-out/review records remain intact. No database/provider/account/configuration mutations are needed or performed for retirement.
- Removed Communications UI/actions/OAuth/sync/cron, business SMS/callbacks, contact suggestions, the communication assistant/AI setting and exclusive matching/adapters. Deleted obsolete provider scripts/tests while retaining the shared CRM portions of mixed acceptance scripts. Removed Twilio plus 25 exclusive transitive packages; no retained dependency version changed.
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

Clean-export stable 0.4.0 validation passes: 873 tests / 75 suites, standalone typecheck and optimized Next 16.3.8 build. Application/configuration/package.json files are byte-identical to the tested export. The generated route manifest contains no Communications/mailbox/SMS/communications-cron paths and retains Calendar and Log Visit. External candidate and production gates are complete; exact delivery evidence is recorded below. Promotion must use one exact-tree, single-parent commit from the refreshed production baseline. Do not replay migrations. Hosted provider-secret revocation or external scheduler/webhook cleanup, if any exists, remains separate operator work.

## Replacement candidate lockfile correction

The first candidate a8dcff38 passed local npm 11 clean install/build/tests but GitHub Node 22.23.4/npm 10.9.9 run 40801279741 correctly rejected two missing optional peer entries. Removing Twilio with npm 11 had pruned workflow/node_modules/chokidar@5.0.0 and readdirp@5.1.1. Both exact existing baseline entries are restored with their original integrity/dependency metadata; no retained version changes. The first candidate and its prepared local promotion are superseded. Repeat the exact-candidate dependency check and hosted build before main; application code remains identical to the 873-test/typechecked/built candidate.

## Verified delivery — October 28, 2026

- Replacement TST candidate: `cc3764aea029510e29c27565a6255e33c3970b57`, immutable tree `f5286ddab3c79ac16a6a8a83d0688023d07d20c1`. No application/lib/test/script/package.json differences from the fully tested a8dcff38 state; replacement changes only original lockfile peer entries and evidence.
- GitHub clean install: [run 40801529977](https://github.com/echospirits/neat-tst/actions/runs/40801529977), job 123210518252, SUCCESS with Node 22.23.4/npm 10.9.9 and all steps successful.
- TST Vercel `dpl_2FVgEmvgQnDKmAvY6Crw2wk9g4bV` is READY for that exact candidate. Its health is 200/connected, database target `neon-neat-tst`, environment `test`.
- Production application commit: `56d47a78c9bcff6a02e52bb325842a8c37d67273`, sole parent `438b1ae16c8859016ed71a9108396d0718ef7fdd`. Its entire tree exactly matches the tested replacement candidate; version is 0.4.0. No divergent TST history is merged into main.
- Production Vercel `dpl_FhqrvwL3xGzar2fcZDKeYX7AKh72` is READY for that exact main commit. `crm.echospirits.com/api/health` is 200/connected, target `ohlq-field-crm`, environment `production`.
- Exact-deployment and production-domain checks return 404 for `/settings/communications`, mailbox connect, business SMS and Communications cron routes. Shared Calendar/Log Visit remain in the built route manifest. No live app-user session or provider connection is created for smoke checks.
- `release:check` against current main/candidate is reviewed: 94 scoped paths plus lockfile evidence, no migration/config/workflow differences, no new environment variables, removed COMMUNICATIONS feature. Untracked local scratch work is excluded from every commit/push.
- Stable tag `v0.4.0` identifies the verified production application commit. Release closeout archives the technical manifest and marks the checklist complete; subsequent closeout commits change documentation only and preserve the runtime/dependency tree. Development remains closed.

No production/TST database deletion, migration, entitlement write, provider activation or configuration mutation occurred. Retained history and credentials remain stored under existing schema/authorization; operator provider-side revocation/secret cleanup, if needed, is separate.
