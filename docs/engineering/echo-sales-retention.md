# Permanent Echo bottle-sales retention

## Policy

Echo Spirits vendor `Z90399001` has no age-based expiration in the existing `OhlqAnnualSalesRow` and `OhlqAnnualSalesByWholesaleRow` tables. Every other vendor keeps the existing `OHLQ_REPORT_RETENTION_DAYS` window, defaulting to **30 inclusive calendar dates**.

This reuses the canonical daily source facts. It adds no duplicate archive, schema migration, dependency, scheduled job, download control or reporting endpoint. The daily downloader, same-date replacement importers and statewide source receipts remain authoritative.

The exception follows the exact source vendor identity, independent of tenant environment configuration, brand ownership, active product status or dashboard exclusions. It preserves all Echo source products, including returns, zero quantities, distillery rows and brands excluded from a particular report. Retail and wholesale quantities remain separate.

## Implementation

`lib/ohlqAnnualSalesRetention.ts` applies both conditions to age-pruned rows:

- The report date is earlier than `reportDate - (retentionDays - 1)`.
- The vendor is not `Z90399001`.

Both table deletions remain in the same transaction. The existing return contract is unchanged. The normal workflow and post-import backfill stage log both policy scopes explicitly.

Retention counts must be positive safe whole numbers. The shared cutoff calculation validates direct and environment-supplied values, rejects impossible report dates and unrepresentable cutoffs, and fails before constructing either deletion.

A complete source report refresh still atomically replaces that report date. Permanent retention prevents age-based cleanup; it does not freeze incorrect quantities against a later source correction.

## Operational behavior

Recent agency sales and statewide market analysis retain their explicit date windows. Older Echo facts do not enter existing 7-day or 30-day totals.

Coverage checks remain strict. An older date containing only retained Echo rows must not be certified as a complete statewide report. Analytics, Tasting Management, daily readiness and wholesale ledger capture retain their existing full-source completeness checks. Existing complete wholesale events and coverage checkpoints are not overwritten by a partial retained day.

Consumers intentionally using historical evidence can see older Echo records: latest-purchase status, product discovery and order reconciliation within its existing sale-date eligibility window. Product filters, tenant access and account identity matching are unchanged.

## Backfill and future reporting

This change stops future age-based deletion after deployment. It does not recreate rows already deleted, establish a historical backfill, or reconnect the four spreadsheet-backed bottle-sales dashboard pages.

Do not pass an Echo-only file to the existing full-report importer. That importer replaces all vendors for the selected date and records statewide source counts. A future vendor-scoped historical load needs an appropriately scoped replacement and completeness record, or a complete source report with the normal retention policy applied afterwards.

Do not pass a multi-month export through a single-date importer. Historical monthly seeding needs its own period-aware path, with an explicit boundary between monthly baseline and daily facts to prevent double counting.

The monthly reporting layer must preserve signed quantities, the original sales month, the accepted dashboard exclusions and distillery semantics. It must establish Echo-specific completeness before treating absent older rows as zero. The existing statewide completeness guards deliberately remain unchanged in this retention-only step.

## TST delivery scope

The change starts from TST `83092dd46206316f3d1bae615bb511e62482eab3` in the existing **0.10.0-dev** cycle. Production baseline `28615305603f61c7d0cb5ba0abb7c7dc4b9d839b` remains the separately released **0.11.0** application plus documentation archive.

Existing paused TST schedules, package and lockfile versions, provider configuration, migrations, dashboard connections and unrelated pilots are preserved. No broad database migration or real-data prune is part of feature validation.

Pre-publication validation is recorded in the accompanying UNRELEASED entry. The published commit's deployment record supplies the hosted build/alias status. Production promotion remains a separate release step under the repository release process.

## Validation

The focused tests exercise row survival in both datasets rather than only comparing query objects: exact vendor identity, old/current boundary dates, excluded products, signed quantities, replay and next-day expiration. Invalid options fail before mutation. Interaction tests protect recent sales windows, corrected full-report imports and incomplete statewide coverage.

PostgreSQL 18.7 SQL predicate and rollback verification passed in a separate synthetic database on an expiring task-owned TST child branch. It preserved old Echo rows byte-for-byte, removed only expired other-vendor rows, retained the inclusive cutoff, made replay a no-op, expired the next day's boundary correctly and rolled back both deletions when the second failed. The direct live Prisma connection was blocked by local TCP access; this SQL fixture does not claim end-to-end service execution. The service behavior is separately covered by stateful tests.

On Node 22.23.5, the full local run passed 1,578 tests and could not launch five unchanged Chromium fixtures. Their prior byte-identical hosted passing evidence is recorded separately in UNRELEASED. Strict typechecking, Prisma generation and an optimized Webpack build pass. The default local Turbopack attempt rejected the external node_modules symlink; the hosted build configuration remains unchanged. All application UI source is unchanged, and no fresh mobile/desktop UI acceptance is claimed for this backend-only policy change.

