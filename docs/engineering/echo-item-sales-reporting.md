# Echo bottle sales: direct reporting contract

## Scope and current state

This additive adapter prepares the existing Looker Studio dashboard to read Echo bottle sales directly from Neon, alongside the separate Bailment source. It does not download reports, run backfill, modify an importer or schedule, populate historical evidence, provision a login, or change a dashboard binding. Its coverage table starts empty, so the main reporting view intentionally returns no rows until the ingestion contract below is integrated and sufficient history is certified. Deployment, live source acceptance and dashboard publication must be recorded separately.

The exact migration is `20261120020000_echo_item_sales_reporting`. It adds one Prisma model/table and three PostgreSQL views. No application version, existing table, historical migration, product rule, retention rule or source status changes. The adapter uses the native PostgreSQL `sha256(bytea)` function and needs no extension. It adds no index: the expected Echo-only reporting volume is small, and performance must be measured before introducing another statewide-table index.

The dashboard history boundary is **January 1, 2025**, matching the existing Item Sales dashboard. The receipt table also accepts earlier real dates without extending that reporting boundary. The source is the daily `OhlqAnnualSalesRow` dataset restricted to the exact vendor **`Z90399001`**. `OhlqAnnualSalesByWholesaleRow` contains additional wholesale customer detail and must never be added to the first table's wholesale quantities. The existing permanent Echo retention policy is a prerequisite; this adapter does not change it.

## Published views and types

`public.echo_item_sales_reporting` is a fixed-Echo security-barrier view. Its first ten fields preserve the existing spreadsheet source contract:

| Field | PostgreSQL type | Meaning |
| --- | --- | --- |
| `Month` | `date` | First day of the actual sales month |
| `District` | `text`, nullable | Recognized current Agency warehouse (`GPT`/`GRN`), or verified A3A mapping; unknown stays null |
| `Agency_Id` | `text` | Original source agency number, including leading zeroes if present |
| `Agency_Name` | `text` | Current Agency label, verified A3A label, or source agency code |
| `Brand` | `text` | Original source item code |
| `Name` | `text` | Current Brand Master name, or item code if missing |
| `Category` | `text`, nullable | Current Brand Master category; unknown stays null |
| `Retail_Bottles_Sold` | `bigint` | Signed monthly retail sum |
| `Wholesale_Bottles_Sold` | `bigint` | Signed monthly wholesale sum |
| `Reporting_Month` | `date` | The same last contiguous, certified closed month on every row |

The following metadata fields follow those ten: `Coverage_Status`, `History_Start`, `Reporting_Through`, `Comparison_Ready`, `Latest_Import_Completed_At`, and `Latest_Known_Source_Acquired_At`. Timestamps presented to Looker are local timestamp values in **America/New_York**. Import completion is not renamed or inferred to be source acquisition. The acquisition field remains null when no actual acquisition time is known; when populated it is the latest known acquisition among certified closed days, which can be earlier than the latest import completion.

Labels are **current dimensions**, not reconstructed historical labels. Both dimension joins are left joins on the unique source code, so unknown, discontinued and distillery records remain in the quantities. Do not add active-product filters, an inner join, identifier-to-number casts, absolute values or positive-quantity predicates.

The following two A3A fallback mappings were independently verified against the existing Item Sales sheet and intentionally work without Agency directory records. A nonblank current Agency name and recognized current warehouse take precedence when present:

| Agency_Id | Agency_Name | District |
| --- | --- | --- |
| `90285` | `ECHO SPIRITS POWELL` | `GPT` |
| `90399` | `ECHO SPIRITS DISTILLING CO` | `GPT` |

All Echo brands and signed/zero quantities remain in this view. Preserve the existing dashboard exclusions for `3150B` and `3750B` and its existing product-label CASE separately; reporting does not discard those underlying facts.

`public.echo_item_sales_reporting_status` provides one row even when no sales are publishable, provided Echo is active, not suspended/cancelled and Ohio-enabled. It contains:

- `History_Start`, `Latest_Closed_Month`, `Expected_Days`, `Certified_Days` and `First_Uncertified_Date`.
- `Reporting_Month`, `Reporting_Through`, `Comparison_Ready` and `Coverage_Status`.
- `Latest_Import_Completed_At` and `Latest_Known_Source_Acquired_At`, with the timestamp meanings above.

Both published views return no rows for an inactive, suspended, cancelled or non-Ohio Echo organization. No source filename, request reference, URL, CSV, hash, other vendor or private customer detail is published.

## Completeness and month selection

`public.echo_item_sales_day_coverage` is a private validation view, not a reporting-login grant target. Its horizon is January 1, 2025 through the last closed month; earlier receipts and facts are not returned or certified by this view. It recomputes each in-horizon day's Echo row count, both signed totals and a deterministic fingerprint, then compares all four with the explicit success receipt. Changed, added or deleted facts invalidate the day even when a row count or net total remains unchanged. Missing receipts are never complete. A known zero-sales day requires a validated empty-source receipt with zero count/totals and the fingerprint of `[]`.

The status view generates every calendar day from January 1, 2025 through the last closed Eastern calendar month. A month is publishable only when every day is certified. The first uncertified day blocks that whole month and all later months from advancing `Reporting_Month`; a later successful import cannot jump the gap. The current partial month is always excluded.

The main view additionally requires `Reporting_Month >= 2026-01-01`. Before then it emits no rows, rather than presenting a current/prior-year comparison with missing history as zero. Once this gate opens, it emits **all** monthly facts from January 2025 through the cutoff, retaining both comparison periods for the existing calculated fields. A cutoff earlier than the latest closed month can still provide a truthful matched comparison, with status `PARTIAL_HISTORY` and an explicitly earlier reporting-through label.

Status values are `AWAITING_CERTIFIED_HISTORY`, `PRIOR_YEAR_HISTORY_INCOMPLETE`, `PARTIAL_HISTORY`, and `READY`. `READY` means every calendar day in the required closed-month history is certified. It does not certify provider truth beyond the validation and provenance of the received source export. A valid all-zero month has no synthetic agency/product sales rows; the status view still certifies its days and cutoff. Consumers must not invent a fake agency/product to create a zero row.

No evidence is inferred from the existing statewide `OhlqReportImportStatus`, current physical row counts, a maximum sales date, or the previous monthly spreadsheet. The adapter never creates success receipts for existing data. A regular importer that changes old Echo facts without refreshing their receipt will cause that day to fail validation until the integration publishes a new validated receipt.

## Ingestion integration contract for Codex

The external backfill/daily-ingestion implementation owns source acquisition, strict parsing, transaction/locking, retries, progress, failure reporting and provider ordering. It must not edit the reporting view to work around an incomplete load. The reporting adapter owns only the additive table, fingerprint contract and views.

`EchoBottleSalesDayCoverage` is success-only, keyed by `reportDate`. All its fields are required except `sourceAcquiredAt`:

| Fields | Required evidence |
| --- | --- |
| `reportDate`, `vendor` | Real date on/after 0001-01-01 and before 9999-12-31; vendor exactly `Z90399001`; the dashboard still begins January 2025 |
| `sourceReportIdentity` | Native Annual Sales Summary report `9781fc23-73de-4ee8-b0b8-77ae6f9b7c4e` |
| `sourceScope` | `VENDOR_FILTERED` for the exact Echo vendor, or `COMPLETE_STATEWIDE` for the complete all-vendor source |
| `requestedFrom`, `requestedTo` | Actual validated report parameters, both equal to `reportDate`; never a month/range assigned to one day |
| `requestReference` | Nonblank internal run/request reference, at most 500 characters; private, not exposed in reporting |
| `sourceContentSha256`, `sourceByteLength` | Lowercase SHA-256 of the actual complete downloaded CSV bytes and exact positive byte length |
| `sourceRowCount`, `sourceSkippedRows` | Actual validated source data-row count before the exact Echo filter, excluding the header/blank lines; duplicate keys are rejected, not deduplicated; skipped rows must be zero |
| `sourceExportCompleted` | Explicit native export completion evidence; must be true |
| `sourceAcquiredAt` | Actual known acquisition timestamp, otherwise null; never substitute import or file-modification time |
| `completedAt` | Actual successful source-import completion timestamp; finite, after the report day in Eastern time |
| `expectedRowCount`, `expectedRetailBottles`, `expectedWholesaleBottles`, `expectedFactsSha256` | Count, signed totals and fingerprint computed from the validated, complete Echo source facts |

The database rejects mismatched vendor/report identity/date bounds, invalid provenance, skipped rows, negative counts, malformed hashes, non-past report-day completion, and invalid zero-day evidence. For an Echo-filtered export `sourceRowCount` must equal `expectedRowCount`; for statewide it may be larger. An acquisition time, if provided, must be after the sales day and no later than import completion. A future completion timestamp cannot currently certify a day in the view.

Before writing a receipt, the ingester must validate native source identity, resolved parameters, completion/freshness evidence, required headers, exact dates and signed integer quantities. Reject conflicting or duplicate source keys instead of silently overwriting them, and reject truncation, partial downloads or skipped malformed rows. Empty Echo results are legitimate only after the complete requested source has been validated. Source assertions cannot be proven by SQL from a hash string alone; an unvalidated CSV must never produce a receipt.

**Atomically replace the relevant Echo day facts and write its receipt in the same database transaction.** Serialize conflicting vendor/day operations and reject stale conflicting source evidence under the worker's source-ordering policy. The existing full-state importer has a broader replacement scope and must not receive an Echo-only CSV. Do not add non-Echo historical rows merely to satisfy this reporting interface. On any error, roll back both writes; retain the previous matching receipt/facts, and report the failed attempt separately. Do not mutate the shared statewide completeness record to make an Echo-only day appear statewide-complete.

### Deterministic fingerprint

Hash the **UTF-8 bytes of PostgreSQL JSONB text** of an array of these six-element arrays, in this exact order:

```text
["YYYY-MM-DD", "original agencyId", "Z90399001", "original brand", retailInteger, wholesaleInteger]
```

Sort the outer array by `agencyId`, `vendor`, then `brand`, each with PostgreSQL **`COLLATE "C"`**. Dates are `to_char(reportDate, 'YYYY-MM-DD')`. Preserve identifier strings exactly; quantities are JSON numbers, including negative and zero values. Use `jsonb_build_array` / `jsonb_agg` and PostgreSQL `::text`, then `encode(sha256(convert_to(..., 'UTF8')), 'hex')`. An empty set uses the exact text `[]`. Do not use JavaScript `JSON.stringify` as the final byte encoding: its whitespace is different. No name/category/district is part of the fact fingerprint, so legitimate current-label changes do not invalidate sales coverage.

### Parameterized receipt SQL example

This example is **not a standalone backfill or certification command**. Execute only within the same transaction that replaced the day from the already validated source, after comparing the parsed source facts with persisted facts. `$14` is the complete Echo source-row JSON array from strict parsing, **not rows selected from pre-existing database history**. Its object fields are `agencyId`, `brand`, `retailBottlesSold`, and `wholesaleBottlesSold`. The query uses the same PostgreSQL encoding as the validation view.

Parameters are: `$1` report date, `$2` actual requested-from, `$3` actual requested-to, `$4` verified native report identity, `$5` source scope, `$6` request reference, `$7` actual source-byte SHA-256, `$8` actual source byte length, `$9` validated complete source row count, `$10` skipped row count, `$11` actual acquisition timestamp or null, `$12` actual import completion timestamp, `$13` native export-completed evidence, `$14` validated Echo source facts JSON.

```sql
WITH source_facts AS (
  SELECT $1::date AS report_date, x."agencyId", 'Z90399001'::text AS vendor,
    x.brand, x."retailBottlesSold", x."wholesaleBottlesSold"
  FROM jsonb_to_recordset($14::jsonb) AS x(
    "agencyId" text, brand text,
    "retailBottlesSold" integer, "wholesaleBottlesSold" integer
  )
), expected AS (
  SELECT count(*)::integer AS row_count,
    coalesce(sum("retailBottlesSold"), 0)::bigint AS retail,
    coalesce(sum("wholesaleBottlesSold"), 0)::bigint AS wholesale,
    encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(
      to_char(report_date, 'YYYY-MM-DD'), "agencyId", vendor, brand,
      "retailBottlesSold", "wholesaleBottlesSold"
    ) ORDER BY "agencyId" COLLATE "C", vendor COLLATE "C", brand COLLATE "C")::text, '[]'),
    'UTF8')), 'hex') AS facts_sha256
  FROM source_facts
)
INSERT INTO public."EchoBottleSalesDayCoverage" (
  "reportDate", vendor, "sourceReportIdentity", "sourceScope",
  "requestedFrom", "requestedTo", "requestReference", "sourceContentSha256",
  "sourceByteLength", "sourceRowCount", "sourceSkippedRows", "sourceExportCompleted",
  "sourceAcquiredAt", "completedAt", "expectedRowCount", "expectedRetailBottles",
  "expectedWholesaleBottles", "expectedFactsSha256"
)
SELECT $1::date, 'Z90399001', $4::text, $5::text,
  $2::date, $3::date, $6::text, $7::text,
  $8::bigint, $9::integer, $10::integer, $13::boolean,
  $11::timestamptz, $12::timestamptz, e.row_count, e.retail,
  e.wholesale, e.facts_sha256
FROM expected e;
```

On replay/correction, use a guarded replacement/upsert after the same source validation and ordering checks, still within the fact-write transaction; do not ignore a conflict or reuse an old receipt for changed data. The plain insert above intentionally does not implement a stale-update policy on behalf of the external worker. Verify count, signed totals and fingerprint against the just-written rows before committing; a database constraint alone cannot replace the source validator.

## Access, cutover and validation

Provision reporting access separately. The dedicated login needs database `CONNECT`, schema `USAGE`, and `SELECT` only on `public.echo_item_sales_reporting` and `public.echo_item_sales_reporting_status`, in addition to any already-approved Bailment view. It must not receive base-table reads, coverage-table/private-day-view reads, write grants, role membership or application/Neon administrative privileges. Migration SQL revokes `PUBLIC` access and does not create a credential or grant an assumed role name.

Add a new SSL PostgreSQL data source to the existing report; do not replace the working Bailment connector. Preserve the original ten field types, product mapping, exclusion filters and matched YTD formulas using `Reporting_Month`. The status source is separate so missing/incomplete history remains visible when the main view is empty. Do not publish the four bottle-sales page changes merely because the connection succeeds: first reconcile the certified periods, product/agency/channel totals, negative quantities, A3A rows, exclusions and current/prior YTD periods against source evidence. Later source updates appear through ordinary connector refresh; a dashboard cache refresh does not create receipts or acquire new data.

Rehearse the exact migration on a disposable production-derived PostgreSQL branch before a shared target. Behavioral checks must cover no receipts, explicit zero days, missing dates/months, noncontiguous successes, same-count/same-total changed facts, negative quantities, missing dimensions, fixed scope, organization eligibility, month/year boundaries, two-period gating and actual restricted-login access. A failed source load or incomplete backfill must leave truthful status rather than imply zero history. TST/application and production promotion remain separate release steps. Rollback can restore dashboard bindings while retaining these additive objects and all sales facts; no deletion of sales or backfill history is required.
