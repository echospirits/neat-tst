# Bailment financial source — TST validation

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
- Browser fixtures: saved, failed-with-previous, empty and unavailable states at **390 × 844** and **1440 × 1000**, light/dark, plus 320px at 200% text; no overflow, keyboard focus, usable touch target and exact synthetic download. Final control reuses the shared Admin button style. Signed-in deployment acceptance and real provider capture remain pending.
- Production/main remains untouched. Existing disabled TST schedules, hosted job flags and provider configuration are unchanged. Actual main/TST baseline comparison contains 150 pre-existing changed paths; none is proposed for production by this task.

- Optimized `npm run build` passes with inert local settings. The first sandboxed build was blocked by Workflow compiler directory-read restrictions; the same build passed with the required filesystem access. No source change was needed. Final rendered control fixture confirmation passes all 18 checks with animation disabled for deterministic theme sampling; screenshots were visually reviewed.

Deployment and signed-in/manual-provider acceptance evidence will be appended after delivery.

## First deployed acceptance and native format correction

Application `d69370755e1b75b9f014fd65af160647bf6e47c6`, exact uploaded tree `b015b5f27c46ae8c05019fcf329fc007d460b6ec`, deployed READY as `dpl_2w7PHXBAERCfNBspyR5pEuouQM4E`. Canonical health confirms test / neon-neat-tst / connected. Delivery used the connected GitHub service after the local credential helper stalled; uploaded and fetched tree hashes match the tested local tree. Unauthenticated CSV requests return 401 and private/no-store headers.

Signed-in Admin acceptance initially showed the correct no-saved-report state. A controlled existing forecast refresh, request `cmwm9i8q80001l7083nh402qm` / [run 44333323025](https://github.com/echospirits/neat-tst/actions/runs/44333323025), downloaded the native report but financial validation rejected its terminal blank line. Both forecast imports completed (6,273 Bailment forecasting rows and 64 DC rows) and the forecast saved; the request correctly reports PARTIAL with only BAILMENT_FINANCIAL_CAPTURE failed and zero financial captures. No invalid report was published.

Read-only structural inspection of twelve existing native local downloads found the same terminal empty physical record in every file, valid 21-column data rows and no low-level parser errors. No private values were logged or copied into fixtures, and these older files were never saved as financial snapshots. The narrow compatibility fix counts only data rows while retaining all original bytes, rejects interior blank/short/quoted-empty records, and adds sanitized structural failure diagnostics. Synthetic regression tests cover the native line ending and exact totals. Full-page mobile acceptance also identified pre-existing table-driven horizontal page overflow; a page-scoped grid track correction retains table-local scrolling.

The completed correction passes **1,510 tests / 77 suites**, strict typecheck and optimized build. All seven isolated PostgreSQL groups pass again with the native terminal blank line included, preserving exact bytes, three data rows and 113.42 total; temporary synthetic records are cleaned up. A second controlled live run will verify the corrected capture path after deployment.

See [storage/retention, retrieval, limitations and rollback](../engineering/ohlq-bailment-financial-storage.md).
