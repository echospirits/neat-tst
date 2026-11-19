# Direct Bailment reporting — TST validation

## Scope and current status

The owner requested direct database-backed reporting for the existing Board KPIs dashboard and authorized implementation in TST. This work remains in **0.10.0-dev**, starting from `echospirits/neat-tst` branch `tst`, commit `07213320628f4e787a6c24d276eee52124f1f53f`. That baseline withdrew the earlier CSV archive feature. Before delivery, the implementation was integrated with `005fb034e1fac52065e3939fd318afd9d7741478`, preserving its OHLQ source-read retries and verified outcome-notification behavior. The new runtime extends the existing native download with typed reporting rows; it does not restore the canceled button, endpoint or archive writer.

**Implementation, integrated local validation, isolated database rehearsal, shared-TST database application and restricted reporting-login authentication are complete. Dashboard connection, native-runner acceptance and hosted application delivery are pending.** This record must be updated with actual receipts before claiming those remaining steps completed.

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

The original saved TST report was read through the approved Neon integration and parsed locally with the new runtime parser. These facts describe that existing acquisition, not a new November 19 download.

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
| Actual reporting-login privileges | SQL-created `looker_echo_bailment_tst` authenticates as that exact user and reads 6,202 rows. Effective readable public relations contain only `public.echo_bailment_reporting`; writable relations, memberships, schema/database CREATE privileges and executable public SECURITY DEFINER functions are absent. |

The local environment could not resolve the Neon database hostname for direct PostgreSQL connections. The Neon integration independently connected and returned the expected session identities. An initial large seed transfer was interrupted; a readback verified zero snapshots and zero lines before recovery. The `--server-source` preparation route uses the real runtime parser locally, then reads the hash-verified retained CSV inside PostgreSQL. This reduced the seed from approximately 3.6 MB to nine statements and 14,687 bytes while preserving its complete transaction and reconciliation guards. This optional one-time transport rejects cells containing CR or LF; the verified source satisfies that restriction. The normal runtime parser and default prepared VALUES mode continue to support multiline source cells.

The compact seed verifies the source again inside the database and refuses unrelated existing reporting content. Its successful execution establishes actual database storage and reconciliation. It does not prove that the runtime publisher completed in the native download runner; that acceptance remains pending.

Apply only the reviewed additive migration and its checksum receipt. The pre-existing password-reset migration ledger gap is outside scope; no broad migration deployment or drift reconciliation belongs to this change. The dormant legacy archive tables and saved report remain intact.

The reporting role has superuser, database creation, role creation, inheritance, replication and RLS bypass disabled. It has no role memberships. Its default transactions are read-only, with 30-second statement and idle-transaction timeouts. Authentication was tested through the Neon connection using the reporting role itself, not inferred from an owner session. An owner-session `SET ROLE` probe was denied because the owner does not inherit the new role; the subsequent actual-login query succeeded. The actual reporting login's `SELECT 1 FROM public."Organization" LIMIT 0` probe returned permission denied, SQLSTATE `42501`. Its read-only transaction default and `can_write_reporting=false` were also read back through the reporting login.

## Dashboard and hosted acceptance

The separate [Board KPIs — Neon TST report](https://datastudio.google.com/u/1/reporting/26f0eedc-a60c-4e1e-beba-cae307583f58/edit) is saved. Its direct database connection is still pending. The original [Board KPIs report](https://datastudio.google.com/u/1/reporting/6fd5e80b-5a35-4c0d-826a-9b74c466f5fd?s=rw8HxkyJHL8) remains unchanged.

| Delivery gate | Status |
| --- | --- |
| TST application commit and pushed tree | Pending. |
| Exact candidate hosted checks | Pending. |
| Vercel deployment READY and canonical test/database health | Pending. |
| Real native runner publishes typed reporting data | Pending. |
| Dedicated login authenticates and reads the Echo view | Passed on actual `looker_echo_bailment_tst` authentication: expected current user and 6,202 view rows. |
| Private table reads and data changes denied to reporting login | Passed: actual private `Organization` query denied with SQLSTATE `42501`; effective audit finds no writable relations, and the actual login reports read-only transactions and no reporting write privilege. |
| Encrypted Looker PostgreSQL connection | Pending. |
| Test report Bailment source replacement, calculations and total reconciliation | Pending. |
| Source acquisition time visible and accurately dated | Pending. |

The acceptance target is the existing Bailment charts in the copied report reading the restricted Neon view. Other spreadsheet-backed datasets remain in place. Preserve existing invoice-date versus payment-date meaning and distinguish invoice lines from distinct invoices. Record any calculated-field or connector-type changes explicitly.

## Rollback and release boundary

A scoped application revert can stop future reporting publication while retaining the additive tables and the last complete report. Reconnect only the copied report to its earlier source if necessary. Preserve migration history, retained native evidence and unrelated TST work; do not reset or delete shared data as a rollback shortcut.

This validation does not authorize a production release, a new scheduled TST job, replacement of the live dashboard or broader sharing. Follow the separate release process when production promotion is requested. Operational details are in the [implementation guide](../engineering/bailment-reporting.md).
