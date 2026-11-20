# Direct Bailment reporting

This TST change provides typed invoice-line data for a direct PostgreSQL connection from Looker Studio to Neon. It extends the existing native Bailment PO and Invoice download; the canceled CSV download button and archive runtime remain retired. Production promotion is a separate release task.

## Data and refresh behavior

`lib/ohlqBailmentReportingParser.ts` validates the complete native 21-column CSV. Dates become date-only values, amounts and quantities use exact `Decimal(24,6)`, and identifiers remain text. Every original cell is also retained in `sourceValues`. Blank, zero, negative and duplicate lines remain distinct. Forecast exclusions do not remove reporting lines. The parser fails closed for malformed data, incompatible headers, invalid numeric/date values or oversized exports.

`lib/ohlqBailmentReporting.ts` publishes a complete snapshot in one tenant-locked transaction. Readers see the last successful complete snapshot until a newer report is committed. The service verifies the active Ohio organization, configured history start, timezone, native report identity, full-portfolio parameter scope and actual acquisition timestamps. A repeated request with conflicting evidence fails. Newer unchanged content refreshes acquisition metadata without duplicating its lines. Storage retains the current report and one previous distinct report. A continuity check rejects a substantial history loss when established historical months disappear; it cannot prove that an upstream report contains every expected transaction.

The downloader supplies actual export parameters and completion evidence. Reporting publication runs before forecasting transforms the CSV. Its result is independent from forecast import success: a finance-only correction can update reporting, and a forecasting failure does not undo an already published reporting snapshot. No additional OHLQ download or manually maintained date subscription is required. The existing environment's scheduler policy still controls when downloads run; this change does not enable disabled TST jobs.

## Reporting view

`public.echo_bailment_reporting` is fixed to active, nonsuspended Echo organization `org_echo_spirits` with Ohio enabled. It uses a security barrier and exposes only the latest complete reporting snapshot. Its first 21 columns preserve the native names:

```
Vendor_Name, Broker_Name, Invoice_Date, Invoice_Number, PO_Create_Date,
PO_Number, Transfer_Order_Number, Agency, Transfer_Order_Ship_Date,
UPC_Code, Brand, Name, Category, DC_Name, Cases, Odd_Bottles,
Cases_Bottles, Quoted_Case_Price, Discount, Total, Date_Paid
```

Additional fields are `Report_Retrieved_At` (the source acquisition time in the source timezone), `Report_From`, `Report_To` and `Source_Row_Number`. Display source acquisition time in the dashboard; a Looker cache refresh does not itself retrieve a new OHLQ report. The SQL timestamps for source dates are not inferred from the date of migration or dashboard creation.

`Total` remains the native invoice line amount. Dashboard calculations must preserve their current invoice-date versus payment-date meanings. The source contains invoice lines, so counting rows does not mean counting distinct invoices, orders or agencies. `Cases_Bottles` remains source text and should not be summed.

## Guarded migration and retained-source seed

The additive migration is `20261119010000_bailment_reporting`. Do not run a broad migration deployment or repair unrelated history: the database has a pre-existing password-reset migration ledger gap. The scoped command applies only this migration and inserts its exact checksum receipt in the same transaction. Existing archive tables and saved CSV remain unchanged.

The operator first verifies the project, branch and endpoint through Neon. The command accepts only project `dawn-frog-33352119`; shared TST is branch `br-divine-forest-avwq2b3g`, while another branch requires `--rehearsal`. The explicit endpoint must match the private connection URL and require TLS. If Neon exposes project/branch settings in the session they are checked as well; the endpoint-to-project mapping is established by the independently verified Neon response.

Create a private JSON file outside the repository with `databaseUrl`, `projectId` and `branchId`, and restrict its permissions to the operator. Never place credentials in command arguments, documentation, commits or logs. From the repository root:

```bash
node --import tsx scripts/bailment-reporting-setup.ts \
  --config=/private/reporting-target.json \
  --expected-project=dawn-frog-33352119 \
  --expected-branch=VERIFIED_BRANCH_ID \
  --expected-host=VERIFIED_NEON_HOST \
  --rehearsal
```

The default is a dry run that prints the migration checksum and target metadata. Add `--validate-retained` for read-only validation of the saved source. After reviewing the SQL and checksum, add `--apply --checksum=REVIEWED_SHA256 --seed-retained` to apply and seed the isolated rehearsal branch. Repeat the same reviewed command for the independently verified shared-TST endpoint without `--rehearsal`. `--reconcile-retained` performs read-only reconciliation once the view exists.

The one-time seed requires a successful current retained retrieval. It verifies the stored SHA-256 hash, byte and row counts, report identity, parameter scope, configured history start and original acquisition/range metadata. It then calls the same publisher used by future native downloads. Seeding does not claim a new provider retrieval. Reconciliation compares every one of the 21 typed fields, source ordinals, raw source cells, source hash/clock and independent SQL monthly invoice totals. Receipts contain counts, hashes, dates and match status; financial values and raw CSV are omitted. Reconciliation deliberately fails if a newer native report has replaced the retained source, rather than overwriting or mislabeling the newer snapshot.

If direct PostgreSQL access is unavailable in the operator environment, `scripts/bailment-reporting-prepare.ts` can prepare the one-time seed from a private `0600` JSON export obtained through the approved Neon integration. Supply independently verified project/branch identities and `--rehearsal` for an isolated branch. The helper uses the runtime parser, writes a private `0600` SQL bundle, and prints only operational metadata. Apply its entire `statements` array in one transaction after the reviewed migration. The generated guards recheck the actual database identity, current retained source and tenant configuration, and final reconciliation must pass before commit. Submit its `verificationSql` for a subsequent readback. This route validates parsed database storage; it does not execute the runtime publisher and must not be reported as native-runner acceptance.

For a retained report whose original cells contain no CR or LF, add `--server-source` to avoid transferring every invoice row back through the operator connection. This opt-in mode reads the byte-hash-verified retained CSV inside PostgreSQL. Run its read-only `serverSourcePreflightSql` first and require the expected target, row count, 21 cells per row and original-cell digest match. Apply the entire generated transaction only after those results match. The final typed/raw/monthly/source-metadata checks are identical to the default VALUES mode; any disagreement prevents commit. Multiline source cells are rejected by this compact seed mode, while the normal runtime parser and default VALUES mode continue to support them.

On November 19, 2026, the reviewed migration and compact seed were committed on both the isolated rehearsal and shared TST. Each database reconciled 6,202 rows and all 130,242 typed cells, original source values, 86 monthly totals and source metadata. This evidence retains the actual November 18 acquisition time. The SQL-created TST reporting login also authenticated and returned those 6,202 view rows; its effective privilege audit limits public relation reads to the reporting view and allows no relation writes. The actual login's private `Organization` query was denied. Looker and native-runner acceptance are recorded separately in the validation record.

## Looker connection and access

Create a dedicated PostgreSQL login through SQL, with `CONNECT` on the reporting database, `USAGE` on `public` and `SELECT` only on `public.echo_bailment_reporting`. Do not grant membership in application/Neon administrative roles or access to the reporting base tables. Verify effective privileges with the actual login: the view should return Echo rows, private application tables should be denied, and data changes should be denied. The migration revokes default public access to the new objects; login credentials and grants are provisioned separately and never committed.

Use Looker Studio's native PostgreSQL connector with the verified Neon hostname, database and dedicated login. Enable SSL and follow the provider certificate instructions; do not enable client authentication unless the environment explicitly requires it. Select the view or use `SELECT * FROM public.echo_bailment_reporting`. Preserve identifier fields as text and the intended date/amount field types. Initially connect a copy of the existing Board KPIs report, replace only its Bailment source, and validate totals and calculated fields before changing the live dashboard. Other spreadsheet-backed data sources remain separate.

The saved TST report uses the embedded `Neon TST - Bailment` source (`ds55`), with ISRG Root X1 accepted for SSL, client authentication disabled and one-hour Looker freshness. Its 11 original Bailment charts use currency-formatted `SUM(Total)` with `Invoice_Date`; the `Month` calculation remains `FORMAT_DATETIME("%Y-%m", Invoice_Date)` with field ID `calc_f8fr82wf1d`. The quarter rules, target and Monday-based relative six-week periods are unchanged. Core Revenue and Sales Stats each display native `Report_Retrieved_At` in a dynamic **Bailment source retrieved (Eastern)** card. The reusable original source and other spreadsheet datasets remain unchanged.

The copied report has no report-wide filter. The original `Exclusions` filter remains bound to `Brand` in `Dashboard Data - Item Sales`; its saved values are `3150B`, `3750B` and the original third blank-value clause. The separate `Neon Bailment - brand exclusions` filter uses Neon `Brand` with the same exclusion rules. The old Bailment spreadsheet physically omitted those two brands, while the reporting view retains the complete native source. Core Revenue applies the Neon filter directly to its month-to-date and quarter cards and through the year-to-date and last-month card groups. Sales Stats has an explicit Neon page source and the Neon page filter; its quarter card inherits that filter with the old chart-level `Exclusions` removed. The original shared filter is not rebound to Neon. Final scope and financial-card checks passed on November 20.

The official connector guidance is [Neon: connect Looker Studio](https://neon.com/docs/connect/connect-looker-studio) and [Google: connect to PostgreSQL](https://docs.cloud.google.com/data-studio/connect-to-postgresql). The connector's documented result limit is 150,000 rows per query; revisit aggregation or another reporting storage approach if the data grows beyond it. Looker freshness controls caching, while Neat's successful source acquisition controls actual data recency. Database compute consumption still follows the Neon project's plan.

## Delivery evidence

Runtime commit [`00c6e9c5a99136147489838a0b724466ad8e3b7d`](https://github.com/echospirits/neat-tst/commit/00c6e9c5a99136147489838a0b724466ad8e3b7d) is deployed and READY in the `neat-tst` Vercel project. Its exact deployment and canonical `neat-tst.vercel.app` health endpoints both return HTTP 200 with `ok=true`, `database=connected`, `databaseTarget=neon-neat-tst` and `environment=test`. [Actions run `44605137359`](https://github.com/echospirits/neat-tst/actions/runs/44605137359) passed fresh Bailment and Distribution Center downloads for November 19 and five report-control checks. The download validator explicitly recorded **zero database writes**; its newer source validation does not update the November 18 reporting snapshot or establish runtime publisher acceptance. On November 20, the copied Looker report passed final filter-scope verification, financial reconciliation for all seven checked date windows through the actual reporting role, and viewer checks across all seven pages without invalid-filter or System Error messages. All 11 original Bailment charts use the working SSL source. The two new source-time cards show November 18, 2026 at 10:30 a.m. Eastern. Real native publisher acceptance remains outstanding; the GitHub workflow browser session is still signed out, and no manual publisher job was dispatched.

Before claiming completion, record the migration rehearsal and shared-TST checksum, real-source reconciliation, actual reporting-login privileges, relevant tests/typecheck/build, TST commit and deployment health, and the test report connection with source refresh time. An applied migration alone does not demonstrate that Google connected successfully. A test report reading a retained CSV does not demonstrate a new scheduled download. Production release and replacement of the live dashboard remain distinct from this TST implementation.

See the [current TST validation record](../releases/bailment-direct-reporting-validation.md) for exact identities, completed checks and outstanding delivery gates.
