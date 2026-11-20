# Echo Item Sales reporting adapter: validation

**Status: exact-final isolated rehearsal, shared-TST migration/restricted-login verification, local validation gates and reusable Looker source connection passed; preview attachment/chart rebinding pending.** The existing TST package version is **0.10.0-dev**. Production application/database and the existing production dashboard are unchanged. No commit or push is claimed by this record.

## Scope and exact artifacts

The adapter adds `EchoBottleSalesDayCoverage`, private day validation, and two fixed-Echo reporting views. The main view preserves the ten Item Sales source fields and publishes only contiguous certified closed-month history sufficient for the existing matched current/prior-year comparisons. Source ingestion and backfill are separately owned; this change does not alter importers, workflows, schedules, product/tenant rules, retention, package metadata or dependencies.

| Artifact | Exact receipt |
| --- | --- |
| Starting TST application | `7b80a0768ca209da913fb7f6908e20aaa8749423` |
| [Migration](../../prisma/migrations/20261120020000_echo_item_sales_reporting/migration.sql) | `20261120020000_echo_item_sales_reporting` |
| Migration SHA-256 | `1af46d4ad24f9ed078ccd77c937ed2c3ccd1dcb57fe001906cd1027d2dfa31b9` |
| [Behavioral SQL fixtures](../../tests/echo-item-sales-reporting-fixtures.sql) SHA-256 | `56096964d2d7d15223b9e182330d293f9f79f9796b459e6a91da3933b09ddfdc` |
| Schema | Additive `EchoBottleSalesDayCoverage` model in `prisma/schema.prisma` |
| Integration specification | [Echo bottle-sales reporting contract](../engineering/echo-item-sales-reporting.md) |

The migration accepts source-evidence dates from year 0001 while keeping private validation and dashboard/calendar coverage fixed to January 2025 onward. It uses native PostgreSQL SHA-256 with specified JSONB encoding and adds no extension or index. Current master labels take precedence over the two verified A3A fallbacks; missing dimensions never remove sales quantities.

## Exact-final PostgreSQL rehearsal

On **November 20, 2026**, the exact migration above was applied to the disposable production-derived branch **`br-quiet-art-amaek8yc`**, running PostgreSQL **17.12**. This fresh branch establishes the final SQL artifact, rather than relying on the earlier provisional migration or subsequent manual alterations.

The exact fixture file passes **15 domain scenario groups**, including **15 invalid-receipt mutations** rejected by database constraints. Coverage includes the original field contract, signed quantities and wholesale-detail non-addition, explicit zero days, missing/noncontiguous dates, same-count/same-total fact changes, matched-year gating, current-month exclusion, missing/current/A3A dimensions, fixed-vendor and organization scope, pre-dashboard receipt exclusion, and future-completion rejection. Expected fingerprint vectors are independently calculated rather than read from the implementation view.

All fixture mutations run within the isolated transaction and are rolled back. Independent post-rollback checks confirm **635 existing Echo summary rows unchanged**, **zero coverage receipts**, and **zero retained fixture rows**. No source report was downloaded and no existing data was certified by the rehearsal.

The empty main report is the correct initial result. The status view returns **`AWAITING_CERTIFIED_HISTORY`**, with no invented reporting-through month or successful historical completeness. This is an intentional dependency on validated ingestion, not an empty-source success claim.

## Restricted-login and local checks

An actual isolated reporting login authenticates and successfully selects both `echo_item_sales_reporting` and `echo_item_sales_reporting_status`; a raw `OhlqAnnualSalesRow` read is denied. This verifies the intended read path using the restricted connection itself. Credentials and sensitive connection details are excluded from this record. Production privileges and credentials were not changed.

Prisma **6.19.3** schema validation and source diff whitespace checks pass. The database evidence concerns the additive schema, SQL behavior and restricted reporting connection; it does not establish live provider provenance, ingestion atomicity or historical dashboard reconciliation. Fresh local application gates are recorded below.

## Shared-TST migration and actual-role verification

On **November 20, 2026**, the independently verified shared-TST target was project **`dawn-frog-33352119`**, branch **`br-divine-forest-avwq2b3g`**, database **`neondb`**, running PostgreSQL **18.7**. The exact final migration's five DDL statements, its matching Prisma migration-ledger checksum and narrowly scoped grants to the existing **`looker_echo_bailment_tst`** reporting login committed in one successful transaction. No source facts were imported or certified.

Before/after readbacks match: **632 Echo summary rows**, signed totals of **866 retail bottles** and **599 wholesale bottles**, and **zero coverage receipts**. The separately recorded 635-row rehearsal baseline belongs to the production-derived disposable branch; it is not the shared-TST baseline.

The actual TST reporting login authenticates and selects both final views. The main report returns **zero rows**; status is **`AWAITING_CERTIFIED_HISTORY`** with **`Comparison_Ready=false`**, as required before validated history is loaded. Effective privilege checks return false for raw sales-table reads, evidence-table reads, private day-coverage reads and updates to the reporting view. An actual raw-table `SELECT` is rejected with SQLSTATE **`42501`**. This confirms real restricted connection behavior independently of owner-session privilege inference.

This is shared-TST database acceptance. It does not claim a new application deployment, live backfill or source-certification integration. The separate Looker connection evidence is recorded below. The production application/database, its reporting role and original dashboard remain unchanged.

## Fresh local application gates

The independent local checks ran on **Node 24.22.3**, explicitly **not Node 22**. They do not represent a fresh Node 22 CI run.

| Check | Tool version | Result | Elapsed time |
| --- | --- | --- | --- |
| Prisma schema validation | 6.19.3 | Pass | 1.40 seconds |
| Prisma client generation | 6.19.3 | Pass | 3.68 seconds |
| Fresh TypeScript no-emit check | 5.9.3 | Pass | 41.39 seconds |
| Optimized Webpack build | Next.js 16.3.8 | Pass; 17 static pages | 72.30 seconds |

The validation left source inputs and the shared Prisma client unchanged. These checks establish local schema/type/build compatibility for this candidate; they do not replace the separate SQL fixtures, restricted-login verification or live source-data acceptance.

## Reusable Looker source connection

The [reusable Neon TST bottle-sales source](https://datastudio.google.com/u/1/datasources/c39e0d9b-fab7-45c1-bf80-81e468b562c5) authenticates successfully with the existing restricted TST credentials over SSL. The connection required **no certificate upload**. The view's fields were imported with their correct types.

The saved source has **23 fields**: the **16 reporting-view fields**, **six existing dashboard calculations**, and **Record Count**. The saved `Product`, `YTD bottles`, `Prior YTD bottles`, `Bottle change`, `Retail change`, and `Wholesale change` calculations preserve their live field IDs and formulas. This is source-definition acceptance; the empty facts remain governed by `AWAITING_CERTIFIED_HISTORY`.

The separate [preview report](https://datastudio.google.com/u/1/reporting/450b366c-ea69-4d8e-a6d9-f113d11ea513) is awaiting attachment of this source and chart rebinding. Existing production sources/charts remain unchanged. Reusable-source authentication does not establish report-level binding, chart rendering or historical reconciliation.

## Pending delivery and acceptance

- Attach the verified reusable source to the separate Looker preview and rebind the affected charts; confirm empty-state/status behavior and preserved unrelated source bindings.
- Integrate the documented source-receipt contract through the separately owned Codex ingestion/backfill work. Receipts and matching Echo day facts must commit atomically from a validated complete source; physical rows or old global source statuses cannot auto-certify history.
- Reconcile certified monthly/product/agency/channel totals, signed corrections, A3A rows, exclusions and matched current/prior-year periods before any production chart cutover.
- Record any subsequent TST publication or production promotion separately against the actual tested candidate and existing release process.

Existing production Bailment charts, the monthly spreadsheet sources and production schedules remain untouched. A successful database connection alone is not historical-data or dashboard acceptance.
