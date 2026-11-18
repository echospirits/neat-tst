# Bailment financial source — TST validation

> **Withdrawn November 18, 2026:** the owner asked to back out this feature because it is not needed. Financial capture, retrieval/status UI and endpoint, and dedicated tooling/tests are removed; forecasting/downloader/job behavior returns to baseline `44db99f0`. Existing automatic TST schedules stay disabled. The already-applied migration, three dormant Prisma models and previously saved report remain intact; this application rollback performs no database deletion. The implementation/acceptance sections below are historical, not a description of an available feature. The active internal publisher service described below has also been removed.

## Rollback

Rollback starts from verified TST `3088f72611597208cfa2e9ec97a70aa3f17e8395` and reverses only this feature's three commits. Current source/runtime/UI files match their pre-feature baseline. Applied migration history and schema are preserved for compatibility and the saved financial source is not deleted. Production/main, credentials, external provider accounts and hosted scheduling/settings are unchanged. No active forecast refresh request was found before rollback.

The rollback passes **54 focused forecasting/authorization/provider-control checks**, the complete **1,480 tests / 77 suites**, strict typecheck and optimized build. Generated Next route types were refreshed after removing the route. Exact Git comparisons establish that `app/`, `lib/`, `scripts/`, `tests/`, workflows, Vercel configuration and package/lockfile match `44db99f0`; the Prisma schema and applied SQL remain byte-identical to `3088f726`. There are no remaining financial capture callers or API/status controls. Read-only preservation checks record one saved payload, two retrieval records, the current reference and applied migration; no new provider run or database mutation is part of rollback. Post-deployment acceptance checks the removed endpoint for 404, canonical TST health and the unchanged saved-data fingerprint. Retained TST financial schema must be excluded from future production promotion unless separately authorized.

## Historical implementation receipt

Owner-authorized scope: durable native OHLQ Bailment PO and Invoice capture, validation, metadata/status and private Admin retrieval. Production promotion, Google Sheets publishing, monthly sales retention, Google authorization and dashboard changes are excluded.

## Verified starting state

- Dedicated TST remote: `https://github.com/echospirits/neat-tst.git`, branch `tst`, fetched baseline `44db99f0f6066fd97ebbc2a29aaba91f18dc6f3b`, version `0.10.0-dev`.
- Production remote: `https://github.com/echospirits/ohlq-field-crm.git`, branch `main`, fetched baseline `8e0282a7` (not promoted by this task).
- Implementation checkout: `.codex-worktrees/bailment-financial-storage`, branch `codex/bailment-financial-storage`; unrelated dirty primary checkout preserved.
- Existing TST Vercel project: `prj_fNOruLSh6BQNVXAThXYJEjBw2HYA`; baseline deployment `dpl_8tSbR4fqK6GCh5PksqvFh8uZ4DFM` READY at exact baseline.
- Neon TST project: `dawn-frog-33352119`, branch `br-divine-forest-avwq2b3g`; read-only baseline confirms `neondb`, 3 organizations, 58 applied migrations, financial tables absent.
- Isolated migration rehearsal branch: `br-cool-sky-avys13n3`, created from the actual shared TST branch on November 18, 2026.
- Existing disabled TST automatic schedules and job flags must remain disabled. Manual acceptance is distinct from activation.

## Implementation and validation

- Affected behavioral/security/workflow/migration checks: **59/59** pass.
- Complete `npm test`: **1,508 tests / 77 suites**, no failures or skips. Strict `npm run typecheck` passes.
- Prisma schema validates; isolated and shared TST scoped migration applications succeed with exact checksum `b729ee9e96c2c780ce296a30155de84095d8f93904a1a168235aa88870ed886f`. Independent shared ledger readback matches. Existing organization configuration, source/forecast counts and unrelated migration records are unchanged by each scoped application.
- The broad migration-deploy rehearsal stopped at pre-existing password-reset ledger drift (table already exists, entry absent). Shared TST was not subjected to that broad attempt. Only the exact financial migration was applied there using the guarded repository pattern; unrelated schema/history was not repaired.
- Real Prisma/PostgreSQL acceptance passes seven groups on the isolated branch: exact original bytes and 3-row **113.42** reconciliation using integer cents, payment changes/freshness/dedup/replay, two-client concurrency and source ordering, rollback after pointer publication, JSONB scope/continuity checks, all three cross-tenant foreign keys, bounded history plus two protected payloads. Synthetic organizations and rows were removed afterward.
- Browser fixtures: saved, failed-with-previous, empty and unavailable states at **390 × 844** and **1440 × 1000**, light/dark, plus 320px at 200% text; no overflow, keyboard focus, usable touch target and exact synthetic download. Final control reuses the shared Admin button style. Final signed-in/provider evidence is recorded below.
- Production/main remains untouched. Existing disabled TST schedules, hosted job flags and provider configuration are unchanged. Actual main/TST baseline comparison contains 150 pre-existing changed paths; none is proposed for production by this task.

- Optimized `npm run build` passes with inert local settings. The first sandboxed build was blocked by Workflow compiler directory-read restrictions; the same build passed with the required filesystem access. No source change was needed. Final rendered control fixture confirmation passes all 18 checks with animation disabled for deterministic theme sampling; screenshots were visually reviewed.

Final deployment and signed-in/manual-provider acceptance evidence is recorded below.

## First deployed acceptance and native format correction

Application `d69370755e1b75b9f014fd65af160647bf6e47c6`, exact uploaded tree `b015b5f27c46ae8c05019fcf329fc007d460b6ec`, deployed READY as `dpl_2w7PHXBAERCfNBspyR5pEuouQM4E`. Canonical health confirms test / neon-neat-tst / connected. Delivery used the connected GitHub service after the local credential helper stalled; uploaded and fetched tree hashes match the tested local tree. Unauthenticated CSV requests return 401 and private/no-store headers.

Signed-in Admin acceptance initially showed the correct no-saved-report state. A controlled existing forecast refresh, request `cmwm9i8q80001l7083nh402qm` / [run 44333323025](https://github.com/echospirits/neat-tst/actions/runs/44333323025), downloaded the native report but financial validation rejected its terminal blank line. Both forecast imports completed (6,273 Bailment forecasting rows and 64 DC rows) and the forecast saved; the request correctly reports PARTIAL with only BAILMENT_FINANCIAL_CAPTURE failed and zero financial captures. No invalid report was published.

Read-only structural inspection of twelve existing native local downloads found the same terminal empty physical record in every file, valid 21-column data rows and no low-level parser errors. No private values were logged or copied into fixtures, and these older files were never saved as financial snapshots. The narrow compatibility fix counts only data rows while retaining all original bytes, rejects interior blank/short/quoted-empty records, and adds sanitized structural failure diagnostics. Synthetic regression tests cover the native line ending and exact totals. Full-page mobile acceptance also identified pre-existing table-driven horizontal page overflow; a page-scoped grid track correction retains table-local scrolling.

The completed correction passes **1,510 tests / 77 suites**, strict typecheck and optimized build. All seven isolated PostgreSQL groups pass again with the native terminal blank line included, preserving exact bytes, three data rows and 113.42 total; temporary synthetic records are cleaned up.

## Completed TST delivery and real acceptance

- Tested application **`f1f985a430345291a35cf0a170b31c94f8d644d4`**, exact uploaded tree **`7e9e0471df9bfc864ba2c95fc1fc4d88afd19475`**, is **READY** on TST deployment **`dpl_AwqZGrYMC4D12UnjDuSSWoHt5RPE`**. Native Admin diagnostics verify **0.10.0-dev / tst / test / neon-neat-tst / Connected**. Cron jobs and OHLQ imports remain **Disabled**; no hosted setting or schedule was changed. The narrow manual runner uses its pre-existing one-run import authorization.
- Controlled request **`cmwma0aqf0001ig08ossc1wr1`**, [workflow 44336047961](https://github.com/echospirits/neat-tst/actions/runs/44336047961), completed **SUCCEEDED**, with **capturedFinancialReports=1**, **importedSources=2**, **refreshedForecasts=1** and no failed sources. GitHub's complete Node 22 job succeeds, including existing dependencies, Chromium and the actual source runner.
- The first saved financial source is a **fresh native export**, acquired **2026-11-18 15:30:35.342 UTC / 10:30:35 AM EST**, actually requested **2019-01-01 through 2026-11-18**, with **6,202 data rows**, all **21 native columns**, **1,271,648 original bytes** and one terminal blank physical record retained in the payload. Today's end date remains explicitly described as a snapshot in progress.
- The real own-organization Admin downloaded the saved CSV through `/api/admin/ohlq-bailment-report`. The downloaded file is byte-for-byte equal to `getCurrentOhlqBailmentReport`'s saved payload, with original-content SHA-256 **`f582e7422f0d73681f2a306855b61cea977c379e618a2e9186fdfe81adc26386`**, matching size and row count. No second provider download occurs on retrieval. Safe receipt: ignored `output/bailment-live-acceptance.json`; no private CSV or financial source rows are committed or uploaded as CI artifacts.
- Signed-in **390 × 844** and representative desktop **1536 × 639** checks verify the saved status, requested range, row count and enabled download. Mobile page width is contained (375px document content within 390px viewport); wide existing tables scroll inside their 343px containers. Desktop content is likewise contained. Live loading, empty and first-failure states were observed; retained-previous, unavailable, disabled-download and authorization branches are additionally covered by fixtures/tests. Ignored screenshots: `output/playwright/tst-bailment-mobile.jpg` and `tst-bailment-desktop.jpg`. Temporary browser tabs are closed and viewport overrides reset.
- Unauthenticated deployed requests return **401**, `text/plain`, and **private/no-store** caching; server tests additionally cover Sales/Taster, Support View, caller-supplied/cross-organization identity and own Admin/Platform Admin scope. No real user roles, passwords or permissions were changed for testing.
- Normal TST implementation, migration, documentation and acceptance are complete. Production promotion and production migration remain a distinct release task, including fresh target-specific rehearsal and review of existing migration-ledger drift. No additional credentials or configuration are required for this TST phase. Google Sheets publishing/authorization, monthly sales retention and dashboard changes remain later work; their server-side input seam is `getCurrentOhlqBailmentReport`.

See [storage/retention, retrieval, limitations and rollback](https://github.com/echospirits/neat-tst/blob/3088f72611597208cfa2e9ec97a70aa3f17e8395/docs/engineering/ohlq-bailment-financial-storage.md).
