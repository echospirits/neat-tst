# Production Forecasting pilot

Organization-scoped demand planning at **Analytics → Production Forecasting**. The primary output is total expected cases per configured product for the next 30 days, with location evidence below it. This is not net production after finished inventory.

## Source map

| Source | Mapping / treatment |
| --- | --- |
| Bailment PO / Invoice export | `Brand` → configured item; `Transfer_Order_Ship_Date` → outbound movement date; `DC_Name` → fulfillment location; `Cases + Odd_Bottles / Cases_Bottles` → case equivalents (`C6` = six bottles). Require shipped invoice; source availability is the later of invoice and ship date. Preserve the raw row, invoice, PO, transfer and agency references in server-side evidence. Payment date does not determine outbound demand. |
| Distribution Center export | `Code` → configured item; Groveport MIN (14 Days)/MAX (45 Days) → GPT guidance; Green MIN/MAX → GRN guidance. On-hand, over/under and cases/day columns are not production requirements or forecast demand. |
| Existing classification/configuration | Tenant OrganizationProduct OWNED/REPRESENTED, active and not discontinued; EXCLUDED/unconfigured items do not enter demand. Existing inventory detail and retained `distilleryOnlyItemCodes` diagnostics identify Distillery Only. A3A Bailment is included; A3A Dist / Distillery Only is excluded. Classification never comes from DC_Name, product name or an Echo vendor constant. |
| Existing retail sales/inventory | Daily retail/wholesale bottles and agency minimum/onHand are not outbound cases or warehouse min/max. They are not substituted. |

Source headers and the odd-bottle/classification rules were confirmed by the owner on 2026-10-27. Native adapters accept delimited CSV/TSV; the pasted whitespace DC example is not a full file verification. Required native column names are validated explicitly. Unshipped rows, ambiguous duplicate invoice identities and unknown case packs with odd bottles fail atomically.

Imports require a confirmed complete coverage interval for each item/location appearing in the file. Absence within that explicitly confirmed series is zero; absent series remain unknown. Use the normalized contract's explicit zero row to establish a covered series with no shipments. Native exports filter outside-portfolio rows, recording their count. Normalized imports reject unconfigured items. Do not upload a sample row as a complete historical export.

Complete demand slices are immutable and non-overlapping per market/item/location. Exact replay is idempotent; a changed overlapping file is rejected. A future audited source-revision workflow is required for corrections. Failed/incomplete attempts retain safe metadata, no observations or coverage. Guidance observations are append-only; the most recent observed date per location is used.

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

Full historical Bailment/DC exports are still required for real planning. No live report download or sample-as-history import was performed. Inactive/discontinued/excluded products stay outside current production planning; historical snapshots remain retained. Some portfolio items have no current inventory classification text; the owner's explicit included-item selection remains the authority unless Distillery Only evidence excludes them.
