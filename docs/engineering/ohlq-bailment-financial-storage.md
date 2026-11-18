# Native OHLQ Bailment financial source

This TST feature retains the native **Bailment PO and Invoice** CSV independently of forecasting. It does not publish to Google Sheets, authorize Google access, retain monthly sales, or change Looker Studio. Existing automatic TST schedules remain disabled.

## Source and fidelity

The existing Production Forecasting source refresh downloads the report once, using the existing credentials and configured history start through **today in the organization timezone**. Capture receives that exact buffer before forecasting transformation. Forecasting still applies its own eligibility rules and movement coverage through yesterday. Its records and `sourceEvidence` are never used to reconstruct this financial source.

`OhlqBailmentReportPayload.csvBytes` is PostgreSQL `bytea`. SHA-256 covers the original bytes, including BOM, line endings, header order, quoted fields, case, leading zeros, duplicates, blanks, zeros and signed adjustments. No financial field is converted or rounded. Payment-only and price/discount/total-only changes therefore change content identity. Downloads return the stored bytes directly.

## Retrieval and publication

Each tenant-scoped retrieval records a caller-generated identity, request start, acquisition/completion times, actual native requested range, timezone, report ID, actual Vendor/Brand parameter scope, source hash, row count, validation details and outcome. A request through today is a snapshot at acquisition time, not evidence that today's activity is complete.

One transaction takes a tenant advisory lock, validates, saves content and retrieval metadata, advances the successful reference and prunes unprotected records. Current references have composite organization foreign keys. Request start plus retrieval ID provides deterministic ordering; late older completions cannot replace a newer successful request. Readers use snapshot isolation to return one complete matching version. A database failure rolls back publication; capture failure cannot invalidate the prior successful reference.

Identical bytes reuse one payload while a new successful retrieval advances freshness. Replaying the same retained retrieval identity and input returns its recorded outcome. Reusing an identity with different input is rejected. Retries older than the current request cannot replace current data, including after lightweight history expires.

Retention keeps the current payload and one previous distinct successful payload. Identical downloads preserve that previous distinct version. Lightweight history keeps the latest 500 attempts plus the referenced current successful retrieval. Idempotency of the original recorded outcome is guaranteed while its retrieval remains retained; older request ordering continues to protect current data. Retention runs only during capture/failure persistence and is scoped to that organization.

## Validation and limits

The current schema is the exact ordered 21-column native header ending in `Date_Paid`. Unknown, reordered, removed or additional columns fail explicitly and preserve the prior report until the parser/schema policy is reviewed. Validation checks completed native export evidence, report identity, requested parameter scope, organization configuration/timezone, strict UTF-8 and CSV syntax, row shape, nonempty data, detectable truncation and a bounded payload size. HTML/login responses and malformed exports are rejected. Financial values, blank payment dates, negative adjustments and forecasting-excluded products are preserved.

Continuity protection compares compatible historical snapshots. With at least ten prior rows spanning at least two invoice months, a greater-than-50% row decline is quarantined if the oldest historical month or at least half of the distinct historical months disappear. Smaller corrections and declines within a single month are not rejected by this check. A well-formed omission confined to one month can remain undetectable. Legitimate bulk historical removal that meets the quarantine threshold requires source review and a deliberately reviewed policy update; the UI does not bypass validation. It is a conservative signal, not a guarantee of upstream completeness. A syntactically valid upstream export can omit records without providing a detectable marker; the source has no independently verified expected row count or financial control total. Validation metadata explicitly records that upstream completeness cannot be independently verified. Initial capture must be a complete native export, never a forecasting backfill.

## Failure reporting

The native buffer remains available to forecasting if financial validation or persistence fails. Conversely, forecasting failure leaves a successful financial capture committed. Source-run summaries track financial capture separately and report aggregate partial failure only after unrelated existing work has been attempted. Durable failure reasons are a small sanitized code set; raw provider messages, credentials and financial rows are excluded from UI errors, logs and CI artifacts. If the database itself is unavailable, durable failure metadata may also be unavailable; the job still reports capture failure.

## Administrator retrieval and future publisher

Own-organization administrators can view **Admin → Data Status → Bailment PO and Invoice**, showing successful retrieval time, actual requested range, source row count and latest attempt. Failed latest attempts explicitly retain access to the prior saved report. Sales/Taster users and Support View do not gain access.

`GET /api/admin/ohlq-bailment-report` resolves session and organization on the server, rejects unauthorized/support/cross-organization access, and returns the saved CSV with a fixed safe attachment name, `text/csv` and private/no-store caching. It does not rerun OHLQ or accept an organization ID as authorization.

An authorized internal Google Sheets publisher should call `getCurrentOhlqBailmentReport(organizationId)` in `lib/ohlqBailmentReportStorage.ts`. The caller must establish trusted job/user authority and tenant context first. The service returns `{ csvBuffer, metadata }` or `null`, checks content integrity and never requires a public URL or interactive session. `getOhlqBailmentReportStatus` retrieves metadata without loading the large payload. No Sheets publisher is implemented in this phase.

## Migration and rollback

Migration `20261118010000_bailment_financial_reports` adds only the three financial source tables and their constraints/indexes. No historical forecast records are rewritten or used as a seed. Use the guarded `scripts/bailment-financial-migration.ts` with explicit env-file, expected host, `--apply` and reviewed checksum. Rehearse against an isolated TST branch and verify live target identity and migration checksums before applying to shared TST. This follows existing scoped migration tooling; it does not reconcile unrelated migration history. The November 18 baseline has an existing `PasswordResetToken` table without its `20260923123000_password_reset_tokens` ledger entry, so broad `prisma migrate deploy` fails at that older migration. Its shared TST schema and ledger remain unchanged by this feature. Production application and migration require a separate release task.

The prior application can run with the additive tables present. Roll back application code while retaining the tables and saved source. Do not drop financial data as part of application rollback. No new environment variables, provider account, recurring scheduler, Vercel Workflow or feature entitlement are required. Existing source-refresh authorization and scheduling remain authoritative.

Delivery evidence and live-acceptance limits are recorded in [the TST validation record](../releases/bailment-financial-storage-validation.md).
