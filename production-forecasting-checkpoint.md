# Production Forecasting checkpoint

## 1 — Targeted source audit / interfaces

- Base: `staging/tst` 45ba0587; package 0.2.3. Owner requested this TST feature without a new version/cycle. No main push, release tag or version bump.
- Bailment PO / Invoice: **not ingested**. Existing `OhlqAnnualSalesRow` / `OhlqAnnualSalesByWholesaleRow` contain reportDate, brand, agencyId/permitNumber and **bottles**, not warehouse outbound cases. They cannot substitute for this signal.
- DC report: **not ingested**. `OhlqAgencyInventoryCurrent` / Snapshot have retail-agency minimum/onHand, no warehouse maximum. Do not reinterpret this as DC guidance.
- Products: OrganizationProduct (organizationId, market, externalItemCode, OWNED/REPRESENTED/EXCLUDED, active/discontinued). Brand Master has status, category, purchase unit but no A-3a classification enum.
- Existing classification: inventory `detailCodeDescription` is free text (`A3A Bailment`, `A3A Distillery Only`). Central adapter maps exact recognized values to a new structured demand classification. Engine uses that enum, never product-name matching.
- Existing locations: `Agency.warehouse` is reference text; OrganizationA3aStoreIdentifier is tenant-owned. Neither establishes a case-demand observation.
- Minimum additions: normalized, tenant-owned immutable import batches, demand and guidance observations, precomputed forecast runs/snapshots; strict import contract with explicit completeness and case units; daily existing cron pattern; gated Analytics destination; pilot entitlement.
- Native report headers/status/date/quantity semantics requested from owner. Until verified, offer an explicitly normalized CSV contract, never claim direct native-export mapping or live historical forecasts.

## Decisions

- Generic market/item/location series; no fixed GPT/GRN engine branches.
- Append-only non-overlapping complete demand slices, content-hash replay protection. Reject ambiguous overlap, invalid rows and unknown classifications atomically. Coverage applies only to explicitly present series; zero rows can declare an empty covered series. Missing coverage stays unknown.
- Source `available_on` is required, separate from movement date/import receipt. Backtests filter both movement and availability at each origin. No reconstructed historical receipt timestamps.
- Candidate models: recent mean, weighted mean, simple exponential smoothing, seasonal naive, damped growth + seasonality, Croston SBA for intermittent demand. Rolling 30-day origins, deterministic mean absolute error selection with WAPE/MASE/bias reporting.
- Planning targets use a centralized configurable confidence safety margin; finished inventory is not subtracted. DC guidance never enters the demand equation.

## Remaining

2 source ingestion; 3 model/backtests; 4 snapshots; 5 refresh; 6 dashboard; 7 drill-down; 8 validation/tenant/performance; 9 manifest/TST commit/push/deployment.

## Checkpoints 2–8 complete

- Owner supplied both native report headers/sample rows and confirmed item-configuration classification plus odd-bottle conversion. Implemented native CSV/TSV adapters and optional normalized input, preserving source evidence. DC_Name is a location, not a classification.
- Engine, common-origin model selection, confidence/ranges/targets, immutable snapshots and completed-horizon actuals implemented. Guidance-only locations expose missing demand rather than disappearing from totals.
- Successful imports refresh immediately. Daily Vercel cron uses existing Workflow and existing side-effect gate; TST cron remains disabled.
- Analytics dashboard, live filters, mobile cards, product detail, evidence/history/guidance and shared ActionForm implemented. Temporary local synthetic preview removed.
- Full suite 895 passing; focused source/model/UI/cron cases 15 passing; typecheck and production build passed. Database rehearsal passed source replay/overlap/portfolio/tenant/composite FK/snapshot/actuals checks.
- Mobile 390×844, desktop 1440×1000, tablet 1024×900 reviewed with actual components and synthetic data. No page overflow. Dark filter-button contrast corrected.
- TST migration applied/registered only: 20261028010000_production_forecasting; SHA256 013f61facef70ec93e99a03f69952340b57083e8ecf90a2c712d88600e921f70. Database neon-neat-tst, direct host ep-noisy-dew-avchokwr.c-11.us-east-1.aws.neon.tech. Echo enabled, two other tenants disabled.
- Initial Echo run cmvrfrqzp0001upxk2uuafvlr has 30 unavailable product snapshots, zero numeric forecasts and zero source imports. Full real exports remain required; samples are not history.
- New files: lib/productionForecasting/*; app/analytics/production/*; app/api/cron/production-forecasting/route.ts; migration; operator/rehearsal scripts; source/model/UI fixtures/tests; guide and validation record. Existing registry/Analytics entry/platform plan/cron/release/inventory docs updated.

## Checkpoint 9

Manifest/guide/validation updated. Pending final TST commit, push and deployment health receipt. Production origin/main verified e05e4e86bd5816c420462319c36b638bfc97571e; no production write or tag.
