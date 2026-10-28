# Production Forecasting pilot

Organization-scoped demand planning at **Analytics → Production Forecasting**. The primary output is total expected cases per configured product for the next 30 days, with location evidence below it. This is not net production after finished inventory.

## Source map

| Source | Mapping / treatment |
| --- | --- |
| Bailment PO / Invoice export | `Brand` → configured item; shipped invoices use `Transfer_Order_Ship_Date` and `DC_Name`. Owner-approved direct invoices without shipment evidence use `Invoice_Date` and `DIRECT:<Agency>`; missing agency is `DIRECT:UNSPECIFIED` / Unspecified fulfillment. `Cases + Odd_Bottles / Cases_Bottles` → case equivalents (`C6` = six bottles). Source availability is the later of invoice and movement date. Preserve invoice/PO/transfer/agency and original row evidence server-side. Payment date does not determine outbound demand. |
| Distribution Center export | `Code` → configured item; Groveport MIN (14 Days)/MAX (45 Days) → GPT guidance; Green MIN/MAX → GRN guidance. On-hand, over/under and cases/day columns are not production requirements or forecast demand. |
| Existing classification/configuration | Tenant OrganizationProduct OWNED/REPRESENTED, active and not discontinued; EXCLUDED/unconfigured items do not enter demand. Existing inventory detail and retained `distilleryOnlyItemCodes` diagnostics identify Distillery Only. A3A Bailment is included; A3A Dist / Distillery Only is excluded. Classification never comes from DC_Name, product name or an Echo vendor constant. |
| Existing retail sales/inventory | Daily retail/wholesale bottles and agency minimum/onHand are not outbound cases or warehouse min/max. They are not substituted. |

Source headers and odd-bottle/classification rules were confirmed by the owner on 2026-10-27. Full files were supplied and validated on October 28, including explicit approval to count invoiced direct demand. Required native headers, unique invoice identities, quantities and case packs are validated atomically. Partially populated shipment evidence is rejected. Today's movements wait until the next complete-day import. The owner confirmed history is complete from January 1, 2019; the first observed transaction need not equal that start date.

Imports require a confirmed complete coverage interval for each item/location appearing in the file. Absence within that explicitly confirmed series is zero; absent series remain unknown. Use the normalized contract's explicit zero row to establish a covered series with no shipments. Native exports filter outside-portfolio rows, recording their count. Normalized imports reject unconfigured items. Do not upload a sample row as a complete historical export.

Manual normalized demand slices remain non-overlapping. Scheduled native full-history exports use audited append-only reconciliation: stable invoice/movement-date identities, unchanged lines omitted, changed lines retained as new versions, deleted movements represented by zero-case reversals. A changed movement date reverses the old day and adds the new day. Corrections and backdated additions become known on detection; earlier backtests and saved forecasts retain the old evidence. Exports losing more than max(10, 5% of prior positive movements) are rejected as possible truncation. Exact replay is idempotent. Failed/incomplete attempts never establish coverage. Guidance observations are append-only; newest observed guidance is used.

Only the trusted full-history operator/scheduler establishes portfolio-wide zeroes: all explicitly configured items × GPT/GRN and observed direct fulfillment locations over the confirmed history interval. Manual slices cover only explicitly present series. Repeated coverage intervals are merged before model fitting. All history is retained, while forecast reads remain bounded to 1,096 days.

## Automated source imports

The existing **OHLQ Annual Sales Sync** GitHub Actions job now downloads both sources per active, explicitly enrolled tenant using that tenant's existing encrypted OPS credentials and the existing Microsoft sign-in secrets. Bailment report ID: `bdf38254-b332-4d12-b689-1113a2644a40`, reached through the existing authenticated OPS → Power BI path. Select all Vendor/Brand values and the full confirmed date range. Partner DC is the native `https://ops.ohlq.com/partner/DC` table export; its CSV must contain the entire unfiltered table, including rows on subsequent pages. Both formats are mapped by the same tested importer as supplied files.

`Organization.settings.productionForecasting.ohio` requires `historyStart` (ISO date) and `directInvoices` (`invoice-date` or explicitly chosen `shipment-only`). Echo TST uses `2019-01-01` / `invoice-date`. Missing policy fails Bailment safely while DC continues. Runtime code contains no Echo organization/vendor/item constants. Only active, nonsuspended organizations with the explicit feature, OH enabled and configured tenant credentials are enrolled.

TST retains the existing 7:27 AM Eastern schedule; production scheduling is untouched. Each source/tenant is attempted independently, then forecasts refresh. Failures remain visible and preserve last good facts. A focused `productionSourcesOnly=true`, `deploymentEnvironment=test` dispatch runs just these sources. CLI: `npm run sync:production-sources -- --environment test --apply`, subject to existing environment/side-effect identity guards. No new secret or independent scheduler is needed; unrelated TST app cron remains disabled.

Raw exports/screenshots stay in private runner temporary storage. CI logs expose source, tenant ID, status, safe failure reason and counts; the only retained failure artifact is the existing enum-only status JSON. No raw CSV, financial rows, credentials or authenticated screenshots are committed or uploaded as artifacts.

## Engine and validation

`lib/productionForecasting/model.ts` defines generic Market × Product × FulfillmentLocation demand/guidance interfaces. Ohio-specific mapping stays in `ohio.ts`; another adapter can supply these interfaces later. No other-state importer or Ohio-only statistical branch is added.

Candidates: 90-day recent mean, weighted 30/60/90-day mean (50/30/20%), simple exponential smoothing, seasonal naive, damped/capped growth plus seasonal shape, and Croston SBA for intermittent series. Forecast daily, then sum weeks 1–4 plus two remaining days. Growth ratios are capped at 0.65–1.5 and damped; the seasonal model also blends recent demand and longer trend.

Evaluate up to eight non-overlapping rolling 30-day origins. Both movement date and source `available_on` must be known at each origin; no future postings enter fitting. Compare candidates on common origins (at least three), choosing lowest MAE with stable method-order tie-breaking. Report WAPE, daily-naive-scaled MASE and signed bias; all-zero denominators remain unavailable. Native-source availability is inferred from invoice/ship chronology, not a reconstructed historical report-receipt timestamp. Late corrections are not silently rewritten into history.

High confidence requires 365 consecutive covered days, six backtests, WAPE ≤20%, moderate/low weekly volatility and stable forecasts. Medium requires 90 days, three backtests, WAPE ≤50% and bounded volatility. Otherwise Low. Missing coverage, less than 14 consecutive covered days, or source more than seven days old withholds a location forecast. Any unavailable known location withholds the product total.

Location planning ranges use the empirical 80th percentile of absolute 30-day backtest error when at least three errors exist. Sparse history uses an explicitly uncalibrated planning band. Summed product ranges are conservative envelopes, not calibrated probability intervals. They must not be described as guaranteed coverage.

Targets are `ceil(forecast × (1 + safety[confidence]))`: defaults High 5%, Medium 10%, Low 15%. Operators can configure `Organization.settings.productionForecasting.safety` with fractions from 0–0.30. No inventory is subtracted. DC guidance never enters the demand equation. Central thresholds suppress small forecast/guidance changes and unusual-demand noise. No production-risk alert is fabricated without a trustworthy independent planning target.

Methods follow rolling-origin evaluation and scaled-error principles in [Forecasting: Principles and Practice](https://otexts.com/fpp3/toolbox.html#time-series-cross-validation).

## Persistence, refresh and access

Migration: `20261028010000_production_forecasting`. Five additive tables hold source imports, demand observations, guidance observations, runs and product snapshots. Composite tenant/source/product foreign keys, date/quantity checks and tenant/product/date indexes protect persistence. Snapshots retain method/version/configuration, per-location evidence, input signals and historical summaries. Finished horizons receive actuals only with complete coverage; old predictions never change.

`PRODUCTION_FORECASTING` is a separate optional pilot, disabled in standard packages and TST's broad override. The migration explicitly enrolls `org_echo_spirits` by ID and disables it for other current tenants, preserving explicit choices on replay. Platform plan editing has a separate pilot checkbox. Pages/actions and underlying services enforce the entitlement and organization scope. Existing platform support view supplies its explicit organization context.

Successful imports refresh immediately; failure to refresh does not misreport a committed import as failed. A daily 12:30 UTC Vercel cron dispatches the existing Workflow system when the existing cron side-effect gate permits it. TST currently has that gate disabled; this feature does not turn on unrelated jobs. Repeated same-day identical inputs reuse a run; source/config/portfolio changes create another immutable run. A tenant failure does not stop subsequent tenants.

Dashboard reads only precomputed summary JSON and current configured product identities. Drill-down alone reads bounded historical/detail JSON. Models run on the server with at most 1,096 days of observations; source queries are batched, with no per-product history queries. This is demand forecasting only: no ERP, BOM, schedules, allocation automation, purchase orders or AI model.

## Operations / limitations

Use `npx tsx scripts/production-forecasting.ts --env-file=<verified-tst-env> --apply-migration` to apply/register only this reviewed migration. The command verifies target identity and checksum; it does not replay historical migrations. `--organization=<id> --refresh` refreshes an enrolled tenant. Production targets are rejected by this command.

The supplied 6,064-row Bailment history and 33-row Partner DC report were imported into verified TST on October 28. Portfolio filtering, seven Distillery Only items and full-scope zero declarations produce 6,001 normalized demand rows and 60 guidance rows (14 excluded); 23 of 30 products have numeric forecasts. Historical range and direct-invoice policy are configured for automated runs. Live download availability must be checked independently: the signed-in Power BI report returned an upstream render error during development. Do not describe wiring/tests or a skipped Actions run as a successful live download. Inactive/discontinued/excluded products stay outside current planning; historical snapshots remain retained.
