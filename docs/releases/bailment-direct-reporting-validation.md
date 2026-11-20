# Direct Bailment reporting — TST validation

## Scope and current status

The owner requested direct database-backed reporting for the existing Board KPIs dashboard and authorized implementation in TST. This work remains in **0.10.0-dev**, starting from `echospirits/neat-tst` branch `tst`, commit `07213320628f4e787a6c24d276eee52124f1f53f`. That baseline withdrew the earlier CSV archive feature. Before delivery, the implementation was integrated with `005fb034e1fac52065e3939fd318afd9d7741478`, preserving its OHLQ source-read retries and verified outcome-notification behavior. The new runtime extends the existing native download with typed reporting rows; it does not restore the canceled button, endpoint or archive writer.

**Implementation, integrated local validation, isolated database rehearsal, shared-TST database application, restricted reporting-login authentication, hosted TST application delivery and copied-dashboard acceptance are complete. All 11 original Bailment charts use Neon, source acquisition time is visible, all seven checked financial date windows reconcile, and all seven report pages passed viewer checks on November 20. The subsequent one-time native TST run also passed and published a new complete 6,222-row report acquired November 20 at 8:57:57.372 a.m. Eastern. All 11 financial cards then matched the new restricted-role reconciliation, and both source-time cards displayed the new acquisition. Native publication through dashboard display is accepted.**

Production/main and the original dashboard are outside this TST delivery. Automatic TST schedules remain disabled. A direct Looker query or cache refresh does not itself fetch a new OHLQ report. Production promotion and the daily operating schedule remain distinct work.

## Implementation manifest

| Area | Change |
| --- | --- |
| Native download | `lib/ohlqAnnualSalesReport.ts` adds Bailment-only completion evidence containing the actual report identity, resolved Vendor/Brand scope, requested dates and acquisition time after a successful save/read. |
| Parser | `lib/ohlqBailmentReportingParser.ts` preserves the native 21-field schema, original cell strings, source order, duplicates, signed values, blanks and identifiers. Dates and exact decimal values are validated independently of forecasting. |
| Publication | `lib/ohlqBailmentReporting.ts` validates tenant/source provenance and publishes one complete report atomically. Older results cannot replace newer results; unchanged acquisitions reuse stored lines, and the current plus previous distinct report are retained. |
| Existing workflow | `lib/productionForecasting/sourceWorkflow.ts` publishes reporting before forecast transformations and handles each consumer's failure separately. `refreshRequests.ts` retains reporting progress and exposes a sanitized reporting failure in the existing result. |
| Database | Two additive Prisma models, `OhlqBailmentReportingSnapshot` and `OhlqBailmentReportingLine`, plus `public.echo_bailment_reporting`. The security-barrier view is fixed to eligible Echo organization `org_echo_spirits` and exposes 21 native columns plus four source metadata columns. |
| Operator preparation | `scripts/bailment-reporting-setup.ts` supports guarded direct database application and reconciliation. `scripts/bailment-reporting-prepare.ts` prepares a private, guarded SQL seed when approved database access is through the Neon integration. |
| Verification | New parser, storage, native export and workflow tests, plus affected existing source/refresh fixtures. No package version or dependency change. |

The reporting migration revokes PUBLIC access to its new objects and contains no login or password. The dedicated reporting login is provisioned separately through SQL. Actual TST authentication and effective privilege checks are recorded below; credentials remain outside Git.

## Local verification

The complete validation ran on **Node 24.22.3**. These local results are separate from the hosted Node 22 runner and deployment gates.

| Check | Observed result |
| --- | --- |
| Focused behavior checks | The initial 53 passing checks span parser, storage, native provenance, independent source consumers and refresh receipts. Four compact-seed checks subsequently passed; these scopes are included in the final complete suite below. |
| Complete integrated suite | **1,567 passed**, 78 suites across 202 files; zero failures, skips, cancellations or todos; 24.958 seconds, against integrated base `005fb034e1fac52065e3939fd318afd9d7741478`. |
| TypeScript | Standalone strict typecheck passed; the optimized build's TypeScript gate also passed. |
| Prisma | Client generation passed with Prisma 6.19.3. |
| Optimized integrated build | Next.js 16.3.8 with webpack passed, exit 0, in 38.01 seconds; its TypeScript gate passed. Separate Prisma generation passed in 2.778 seconds. |
| Whitespace | `git diff --check` passed. |
| Independent source review | No substantive blocker found in parser/native provenance, transaction ordering/retention, tenant scope, workflow independence, direct setup guards or the offline SQL helper. Compact transport also passed independent review and the actual database reconciliation below. |

The initial complete run had five browser-fixture startup failures because Google Chrome was absent. A private Playwright cache using the existing `@sparticuz/chromium` 148.0.7778.0 dependency and CI browser selection resolved that environment issue without repository changes. The subsequent complete suite passed; the final aggregate above excludes no tests.

The integrated build used `NODE_ENV=production` and inert `APP_ENV=development`, with no database URL or provider credentials and all external side effects disabled. Private logs and machine-readable receipts were retained outside Git under `bailment-validation-20261119`, including `integrated-full-tests-final-receipt.json` and `integrated-build-receipt.json`; no source report or credential is included in the repository.

## Real retained source

The original saved TST report was read through the approved Neon integration and parsed locally with the new runtime parser. These facts describe the retained November 18 acquisition used to seed the reporting view. The later November 19 download-only validation is recorded separately under hosted acceptance and did not replace this snapshot.

| Source evidence | Value |
| --- | --- |
| Organization | `org_echo_spirits` |
| Native report | `bdf38254-b332-4d12-b689-1113a2644a40` |
| Parameter scope | Vendor, all values |
| Retrieval status | `SUCCEEDED` |
| Requested dates | January 1, 2019 through November 18, 2026 |
| Acquired | November 18, 2026, 10:30:35.342 a.m. America/New_York (`2026-11-18T15:30:35.342Z`) |
| Native bytes | 1,271,648 |
| Parsed data rows | 6,202 |
| Invoice-month groups | 86 |
| SHA-256 | `f582e7422f0d73681f2a306855b61cea977c379e618a2e9186fdfe81adc26386` |
| Parser result | Row count and raw-byte hash match the stored source. |

Database reconciliation passed on both the isolated rehearsal and shared TST. It covers all **130,242 typed source cells** (6,202 × 21), original cell arrays, row ordinals, source dates/hash/clock and independent monthly invoice totals across 86 groups. Both receipts report `rowCount=6202`, `typedCellsMatch=true`, `rawCellsMatch=true`, `monthlyTotalsMatch=true`, `sourceMetadataMatch=true` and `viewMetadataMatch=true`.

## Database targets and migration

| Item | Verified identity or current state |
| --- | --- |
| TST project | `dawn-frog-33352119` (`neat-crm-tst`) |
| Shared TST branch | `br-divine-forest-avwq2b3g` |
| Isolated rehearsal branch | `br-falling-meadow-avhegeea`, `codex-bailment-direct-reporting-20261119` |
| Database | `neondb`, PostgreSQL 18 |
| Additive migration | `20261119010000_bailment_reporting` |
| Reviewed migration SHA-256 | `a513d0691e3cd34c99228038eea15b5561ead67e84a1b4d25e98a3db3d2e290a` |
| Rehearsal preflight | Actual Neon project/branch settings matched. Before application, reporting objects and migration ledger entry were absent. The compact source preflight returned 6,202 rows, 21 cells per row and an exact original-cell digest match. |
| Rehearsal application/seed | The reviewed migration and checksum were applied; the compact nine-statement seed committed atomically. A subsequent readback returned all six reconciliation results described above. |
| Shared TST application/seed | The actual branch and retained source matched the verified evidence. The same reviewed migration/checksum and compact seed committed in one transaction, returning all six matching reconciliation results. |
| Actual reporting-login privileges | SQL-created `looker_echo_bailment_tst` authenticates as that exact user and initially read the 6,202-row retained snapshot. Effective readable public relations contain only `public.echo_bailment_reporting`; writable relations, memberships, schema/database CREATE privileges and executable public SECURITY DEFINER functions are absent. The subsequent native-run readback below uses the same login. |

The local environment could not resolve the Neon database hostname for direct PostgreSQL connections. The Neon integration independently connected and returned the expected session identities. An initial large seed transfer was interrupted; a readback verified zero snapshots and zero lines before recovery. The `--server-source` preparation route uses the real runtime parser locally, then reads the hash-verified retained CSV inside PostgreSQL. This reduced the seed from approximately 3.6 MB to nine statements and 14,687 bytes while preserving its complete transaction and reconciliation guards. This optional one-time transport rejects cells containing CR or LF; the verified source satisfies that restriction. The normal runtime parser and default prepared VALUES mode continue to support multiline source cells.

The compact seed verifies the source again inside the database and refuses unrelated existing reporting content. Its successful execution establishes actual database storage and reconciliation. It does not prove that the runtime publisher completed in the native download runner; the separate real-run acceptance below supplies that evidence.

Apply only the reviewed additive migration and its checksum receipt. The pre-existing password-reset migration ledger gap is outside scope; no broad migration deployment or drift reconciliation belongs to this change. The dormant legacy archive tables and saved report remain intact.

The reporting role has superuser, database creation, role creation, inheritance, replication and RLS bypass disabled. It has no role memberships. Its default transactions are read-only, with 30-second statement and idle-transaction timeouts. Authentication was tested through the Neon connection using the reporting role itself, not inferred from an owner session. An owner-session `SET ROLE` probe was denied because the owner does not inherit the new role; the subsequent actual-login query succeeded. The actual reporting login's `SELECT 1 FROM public."Organization" LIMIT 0` probe returned permission denied, SQLSTATE `42501`. Its read-only transaction default and `can_write_reporting=false` were also read back through the reporting login.

## Dashboard and hosted acceptance

The separate [Board KPIs — Neon TST report](https://datastudio.google.com/u/1/reporting/26f0eedc-a60c-4e1e-beba-cae307583f58/edit) is saved with the embedded PostgreSQL source `Neon TST - Bailment` (`ds55`) connected to `public.echo_bailment_reporting`. The earlier Manage added data sources receipt showed it as Working with 13 charts: all 11 original Bailment charts and two new source-timestamp cards. Final viewer acceptance is recorded separately below. The original [Board KPIs report](https://datastudio.google.com/u/1/reporting/6fd5e80b-5a35-4c0d-826a-9b74c466f5fd?s=rw8HxkyJHL8) remains unchanged.

The runtime was published to `echospirits/neat-tst/tst` as [commit `00c6e9c5a99136147489838a0b724466ad8e3b7d`](https://github.com/echospirits/neat-tst/commit/00c6e9c5a99136147489838a0b724466ad8e3b7d), with tree `a90c434b618571a1b35188235c63048650399e55` and parent `005fb034e1fac52065e3939fd318afd9d7741478`. The GitHub tree matched the reviewed local index exactly. This runtime SHA remains the acceptance target even when a later documentation checkpoint records the results.

| Hosted receipt | Observed result |
| --- | --- |
| Exact-commit Actions | [Run `44605137359`](https://github.com/echospirits/neat-tst/actions/runs/44605137359), job `135846689213`, completed successfully on the exact runtime SHA. The job completed November 19, 2026 at `20:08:04Z`; the run was marked complete at `20:08:05Z`. |
| Source-download validation | Both sources validated for report date `2026-11-19`: Bailment returned 6,290 parser rows and Distribution Center returned 64 parser rows. The final receipt reports two sources, zero failed sources, environment `test`, database target `neon-neat-tst` and **zero database writes**. These are download-validator counts, not the 6,202 retained reporting-view rows. |
| Hosted regression checks | Five report-control tests passed on Node 22.23.4; zero failures, skips, cancellations or todos; 2,081.873233 ms. |
| Vercel identity | Project `neat-tst`, ID `prj_fNOruLSh6BQNVXAThXYJEjBw2HYA`; deployment `dpl_BPj76bSvJ5sD1qPoJh5t3kusjZWw`. Metadata confirms repository `echospirits/neat-tst`, branch `tst` and exact runtime commit. |
| Vercel readiness | READY at `2026-11-19T20:07:53.915Z`; the GitHub Vercel status reports success at `20:07:54Z`. |
| Exact deployment health | [Exact deployment `/api/health`](https://neat-ft9uw2h6o-joe-1533s-projects.vercel.app/api/health) returned HTTP 200. |
| Canonical TST health | [Canonical `/api/health`](https://neat-tst.vercel.app/api/health) returned HTTP 200 after the canonical alias was assigned to the exact deployment. Both health responses were verified by `2026-11-19T20:08:37.658Z` and report `ok=true`, `database=connected`, `databaseTarget=neon-neat-tst`, `environment=test`. |
| Deployment runtime logs | The deployment-scoped error/fatal query for the preceding 15 minutes returned no matching groups. This is a bounded log observation, not a claim that every application path was exercised. |

The November 19 source-validation workflow ran automatically for the push with `OHLQ_IMPORT_ENABLED=false`; no manual source job was dispatched for that acceptance. It downloads, validates and discards the sources without importing or refreshing forecasts. That successful fresh download did not establish runtime publication into the reporting tables or replace the November 18 acquisition. The workflow logged a non-failing deprecation warning for the checkout/setup-node actions being forced from Node 20 onto Node 24; its application command used Node 22.23.4.

The Basic PostgreSQL connection was saved successfully after the ISRG Root X1 certificate upload, with SSL enabled and client authentication disabled. Looker accepted the connection and reports the embedded source as Working. Data freshness is set to one hour. The source preserves the existing `Month` calculation, `FORMAT_DATETIME("%Y-%m", Invoice_Date)`, using field ID `calc_f8fr82wf1d`. Identifiers remain text, and date and numeric fields retain their intended types.

All four original Bailment charts on Core Revenue and all seven on Sales Stats now use `ds55`. Each financial metric was rebound to currency-formatted `SUM(Total)` with `Invoice_Date` as its date-range field; these existing financial charts use invoice dates, not `Date_Paid`. The quarter target remains unchanged. The three relative six-week cards retain Monday-based ranges with start/end week offsets of 6/1, 12/7 and 58/53.

The original Bailment spreadsheet physically omitted brands `3150B` and `3750B`. The native reporting view intentionally retains the complete source. The copied report's default source is `ds55`, and it has no report-wide filter. The original `Exclusions` editor was verified against `Brand` in `Dashboard Data - Item Sales`, with saved values `3150B`, `3750B` and its original third blank-value clause. It remains a spreadsheet filter. The separate `Neon Bailment - brand exclusions` filter is bound to Neon `Brand` with the same exclusion rules.

Core Revenue applies the Neon filter directly to the month-to-date and quarter cards and through the year-to-date and last-month card groups. Sales Stats has an explicit Neon page source and the Neon page filter. Its quarter card has the old chart-level `Exclusions` removed and **Inherit filters** checked. These bindings preserve the original exclusion rules without rebinding the shared spreadsheet filter to Neon; the quarter date ranges and target remain unchanged.

Private reconciliation before the native run on November 20 used the actual reporting role and passed all seven date windows: month-to-date, year-to-date, October, quarter-to-date and the three relative six-week periods. The four Core Revenue and seven Sales Stats financial cards displayed the expected results after the filter correction. Relative-date comparisons were evaluated on November 20; they can advance with the calendar independently of the source acquisition. Financial amounts, percentages and target values are omitted from this public record.

The earlier source-inventory receipt showed the original reusable Bailment source `ds0` with zero charts in the copy; that source was not modified. The unused task-created duplicate `ds54` was removed through Looker's reversible remove action. The other spreadsheet source chart counts were unchanged: `ds28=6`, `ds36=2`, `ds37=1`, `ds7=2`, `ds9=1` and `ds48=2`. This inventory was not reread during the November 20 viewer checks.

Core Revenue and Sales Stats each have a new dynamic dimension card labeled **Bailment source retrieved (Eastern)**. Both read native `Report_Retrieved_At`, formatted as `MMM d, yyyy h:mm a`. Before the native run, both showed the actual retained **November 18, 2026, 10:30 a.m.** acquisition, displayed to the minute. The one-hour Looker cache freshness does not fetch a new OHLQ report.

All seven report pages loaded in viewer mode on November 20 without invalid-filter or System Error messages:

| Viewer page | Final observation |
| --- | --- |
| Core Revenue | Four original financial cards and the source-timestamp card displayed correctly. |
| Sales Stats | Seven original financial cards and the source-timestamp card displayed correctly. |
| Monthly Bottle Sales | Table rendered with 22 rows. |
| Product Performance | Table rendered; 25 products reported, through October. |
| Agency Performance | Table rendered; 140 total agency entries reported, through October. |
| Channel Trends | Chart rendered. |
| Venue Trends | Both charts rendered. |

## Native publisher acceptance — November 20, 2026

After the owner restored GitHub sign-in, exactly one existing **OHLQ Annual Sales Sync** workflow was manually dispatched in the TST repository. [Run #277 (`44748621091`)](https://github.com/echospirits/neat-tst/actions/runs/44748621091) used branch `tst`, checkpoint `8f1792105606f4d0e6090033d348ce58d2d4ff72`, and the unchanged accepted runtime. It started at 8:55:37 a.m. Eastern and completed **successfully at 8:59:38 a.m. Eastern**. Job `136330352553`, including its native-source step, succeeded. Its log at `2026-11-20T13:58:00.9948610Z` reports `source=BAILMENT_REPORTING`, `status=published`, `rows=6222`, `reportDate=2026-11-20` for `org_echo_spirits`.

The dispatch set `deploymentEnvironment=test`, `productionSourcesOnly=true`, `purchaseStateOnly=false`, `repairTenantCredentials=false` and `days=1`; all date and tenant override fields were blank. The focused path downloads Bailment and Distribution Center guidance and runs the existing forecast/operational-signal refresh. Normal sales, account/Brand Master, shared-inventory, credential-repair and normal-load verification steps were skipped as intended. No TST schedule was enabled. Preflight found no active TST forecast request or database advisory lock and no competing queued/running workflow in either repository; the existing concurrency group serializes TST runs within its repository.

| Fresh reporting evidence | Observed result through `looker_echo_bailment_tst` |
| --- | --- |
| Source acquisition | **November 20, 2026, 8:57:57.372 a.m. America/New_York** (`2026-11-20T13:57:57.372Z`) |
| Requested report range | January 1, 2019 through November 20, 2026 |
| Native reporting rows | **6,222**, replacing the 6,202-row retained bootstrap snapshot |
| Distinct invoice numbers | 3,995; invoice-line row count remains a separate measure |
| Rows after existing brand exclusions | 6,052 |
| Source ordinals and clock | 6,222 unique consecutive values from 1 through 6,222; one acquisition timestamp |
| Required and provenance fields | Zero missing invoice dates, invoice numbers, totals, retrieval timestamps, range dates or source ordinals |
| Range and tenant scope | Latest invoice date November 20; zero invoice dates outside the report range; vendor names remain within the Echo family |
| Snapshot consistency | Initial detection and subsequent detailed reads returned the same complete new snapshot; no mixed or partial snapshot was observed |
| Financial reconciliation | Actual-role calculations passed for the current and comparison periods; October and all three historical six-week windows were unchanged |

After refresh, all four Core Revenue and seven Sales Stats financial cards matched the new restricted-role calculations, including the current/comparison values, quarter target progress and all three six-week windows. Both native source-time cards displayed **November 20, 2026, 8:57 a.m.**, with no loading/error state. The existing month/year-to-date settings exclude today, while the quarter card uses the full current-quarter range and can include today's invoices; those original semantics and the target remain unchanged. Fresh screenshots are retained privately, with no financial values or images included in this public record. This live run, distinct from the retained-source seed and the November 19 download-only check, establishes native-runner publication through dashboard display. It does not enable daily production operation; the other monthly spreadsheet-backed sources are unchanged.

| Delivery gate | Status |
| --- | --- |
| TST application commit and pushed tree | Passed: runtime commit `00c6e9c5a99136147489838a0b724466ad8e3b7d`, exact reviewed tree `a90c434b618571a1b35188235c63048650399e55`, published to TST. |
| Exact candidate hosted checks | Passed: exact-commit source-download validation and five report-control tests in Actions run `44605137359`. |
| Vercel deployment READY and canonical test/database health | Passed: exact deployment and canonical alias both return HTTP 200 with the expected connected TST database identity. |
| Real native runner publishes typed reporting data | Passed November 20: focused manual TST run #277 succeeded and published the fresh, complete 6,222-row native snapshot. |
| Dedicated login authenticates and reads the Echo view | Passed on actual `looker_echo_bailment_tst` authentication: expected current user, the initial 6,202-row seed and the new 6,222-row native snapshot. |
| Private table reads and data changes denied to reporting login | Passed: actual private `Organization` query denied with SQLSTATE `42501`; effective audit finds no writable relations, and the actual login reports read-only transactions and no reporting write privilege. |
| Encrypted Looker PostgreSQL connection | Passed: saved Basic PostgreSQL + SSL connection; ISRG Root X1 accepted; embedded source `Neon TST - Bailment` (`ds55`) reports Working. |
| Test report Bailment source replacement and calculations | Passed: all 11 original charts now use `ds55`; Month, invoice-date semantics and relative periods are preserved. |
| Filter scope and financial-card reconciliation | Passed November 20: separate spreadsheet and Neon filters, no report-wide filter, direct/group scope on Core Revenue and explicit page scope with quarter inheritance on Sales Stats; actual-role reconciliation passed all seven checked date windows. |
| Source acquisition time visible and accurately dated | Passed: both dynamic cards advanced to the native November 20, 8:57 a.m. acquisition in Eastern time after the real publisher run. One-hour Looker freshness is configured separately. |
| Final copied-report visual checks | Passed: initial November 20 acceptance covered all seven pages; subsequent post-publication checks verified all 11 financial cards and both source-time cards on Core Revenue and Sales Stats without loading/error states. The remaining spreadsheet-backed pages are unchanged. |

The accepted source mappings affect only the copied report's Bailment charts. Other spreadsheet-backed datasets remain in place. The reporting view still contains invoice lines, so a row count must not be labeled as distinct invoices, orders or agencies. Future financial cards must state whether they use invoice date or payment date.

## Rollback and release boundary

A scoped application revert can stop future reporting publication while retaining the additive tables and the last complete report. Reconnect only the copied report to its earlier source if necessary. Preserve migration history, retained native evidence and unrelated TST work; do not reset or delete shared data as a rollback shortcut.

This validation does not authorize a production release, a new scheduled TST job, replacement of the live dashboard or broader sharing. Follow the separate release process when production promotion is requested. Operational details are in the [implementation guide](../engineering/bailment-reporting.md).
