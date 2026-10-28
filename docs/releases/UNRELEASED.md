# Unreleased

Neat **0.2.3** was released on 2026-10-19. [Archived technical release](0.2.3.md) | [Tenant announcement](0.2.3-user-notes.md) | [Production receipt](0.2.3/production-rollout.json).

Package version remains 0.2.3. On 2026-10-27 the owner explicitly authorized Production Forecasting feature development in neat-tst only, without a new version/cycle, production version bump or release tag. On October 28 the owner also authorized an incremental Echo-only transition in neat-tst. Production promotion remains a separate task.

## Same-version production hotfix: OHLQ dependency installation (2026-10-19)

- Repair the Workflow optional peer lock entries for chokidar 5.0.0 and readdirp 5.1.1. Production run 39289943922 failed at npm ci before any import; the earlier run 39282816365 succeeded.
- Preserve version 0.2.3 under the owner-authorized same-version production hotfix scope. No application logic, schema, credentials, flags, or dependency version upgrades.
- Require the exact-candidate Node 22/npm 10 dependency check before future promotions; today's check 39285632962 had failed despite the application deployment succeeding.
- Validation and deployment evidence: [Hotfix notes](0.2.3-ohlq-lockfile-hotfix.md).

## Same-version production hotfix: OHLQ connectivity and inventory status (2026-10-21)

- Recover transient database failures for fixed-value report-status upserts and inventory readiness reads with bounded retries. Imports and intelligence writes are never replayed by this retry helper.
- Preserve COMPLETED inventory status when follow-up intelligence fails; report that failure separately and continue other tenants. Sales startup failures now reach error-status handling.
- Version remains 0.2.3. No migration, credentials, flags, dependency, or UI changes.
- Evidence: [Hotfix notes](0.2.3-ohlq-connectivity-hotfix.md).

## TST operational repair: Echo Spirits inventory credentials (2026-10-21)

- Scope: TST only, organization org_echo_spirits, database target neon-neat-tst. Version remains 0.2.3; no application, migration, flag, or production change.
- Oct 20 run 39450882806 and Oct 21 run 39630789234 completed shared reports but OHLQ rejected the tenant inventory login. Shared reports use the GitHub Environment OPS secrets; inventory uses separately encrypted organization credentials.
- Used the existing explicit repairTenantCredentials workflow option with deploymentEnvironment=test to refresh only this tenant from the working TST secrets. No credentials were read into local files or logs.
- Repair step succeeded in [run 39637440812](https://github.com/echospirits/neat-tst/actions/runs/39637440812); all import and intelligence steps subsequently succeeded, verified on October 27. The October 26 actual load (40369058352) also completed every import successfully.
- Earlier failures (for example Oct 18 run 39137135917) were missing lockfile entries, fixed Oct 19. A green scheduled run can mean every import step was skipped: verify individual steps before claiming recovery.
- On future OHLQ password changes, update the appropriate tenant organization settings as well as shared-report secrets; never copy a shared login to another tenant automatically.

## Same-version production hotfix: independent OHLQ report steps (2026-10-27)

- Production runs 40500292563 and 40500295861 stopped because the newest upstream Account Master was dated October 26, not October 27. This is an upstream publication delay; retain the freshness guard and its visible failure.
- Permit Brand Master and sales imports to run after a master-report failure, allowing inventory and post-sales processing to continue. Require successful setup/secrets validation, no failed explicit credential repair, an active schedule slot, and no cancellation. Do not hide failures with continue-on-error or import stale master data.
- Version remains 0.2.3. Workflow-only behavior change; no application, dependency, database, or credential changes.
- Validation: focused workflow isolation/security/privacy tests and git diff --check. Live recovery verification follows publication.

## Entry template

### Feature/change name

- Description: What changed and why.
- Relevant commit(s): Short SHA(s) from TST.
- Feature flag: Key, or None.
- Default flag state: Enabled, disabled, pilot-only, or N/A.
- Migration(s): Path(s), or None.
- Environment/config: Variable names, or None; never secrets.
- User-visible: Yes or no.
- Production readiness: Ready, blocked, or not reviewed, with reason.
- Rollout notes: Required operator steps, or None.

## Pending changes

None.

## TST audit: final Echo-only access and release comparison (2026-10-28)

- Audit the current application surface and exact main/TST trees. All 69 eligible anonymous GET probes across the 81-entry-point inventory passed, including follow-through of two guarded legacy aliases. Older immutable TST builds redirect to Vercel authentication. No authenticated job, app session, provider operation, export or outside deletion was performed.
- Correct release:check to compare the exact current production SHA/tree. Numerically highest historical tags and divergent commit lists no longer determine pending release contents. Two disposable-Git regression cases cover the older higher-version tag and equivalent trees on divergent histories. No application UI/domain change.
- Owner chose **Include Forecasting in future release**. The audit identifies the single pending Forecasting migration, preserved historical ledger/line-ending differences, missing production Forecasting source configuration and required production owner ADMIN normalization. These are future cutover steps, not operations authorized/executed by this audit.
- Production/main and both live databases are unchanged. Version remains 0.2.3; no dependencies, migration files, configuration or credentials changed. Evidence and the concrete cutover sequence: [final audit](echo-only-final-audit.md).
- Validation: 910 tests / 76 suites, typecheck, whitespace checks and a fresh isolated Node 22/npm 10 clean install passed. Detailed customer activity metrics remain in the ignored local receipt because this repository is public.

## TST transition: retire Support, Recipes and legacy setup (2026-10-28)

- Owner selected **Retire in-app Support** and **Remove recipes from Neat**. Delete their pages/actions/APIs/services, catalog/costing/approval/account recommendations, public recipe sheets, recipe-photo upload helper, Support screenshot/reply/update/trail controls and navigation. Existing public share URLs no longer resolve through the new application.
- Retain schema, stored Support/Recipe/history/blob records, ownership and passive legacy account-merge references. No migration, revocation write, export or deletion is performed. Read-only TST counts found zero Support tickets/private notes, recipes/suggestions/share records across all three organizations.
- Restrict User Activity page and every report query to Echo-admin context, including retained PLATFORM_ADMIN role callers. Ignore forged company filters; remove company-switch UI and platform navigation fallback. Remove the remaining Analytics forecast-link role bypass, unused platform guard exports and unused organization bootstrap helper. Existing private communication/assignee protections stay in place.
- Retire unsafe staging/password-admin/sample seeds, all-feature reconciliation, platform bootstrap and recipe-import commands. Package scripts change only; version 0.2.3, dependencies/lockfile, schedules, credentials and persisted feature flags are unchanged. Existing Users invitations/Echo Settings remain supported; new-database/initial-owner provisioning requires a separate reviewed procedure.
- Validation: 908 passing tests / 76 suites, typecheck, optimized build, retired-route checks and actual-layout/activity static preview at 390x844 and 1440x900. Exact deployment/health evidence: [increment 4](echo-only-transition-validation.md#increment-4-module-retirement-and-remaining-administration). TST only; production remains unchanged.

## TST transition: confine background processing to Echo (2026-10-28)

- Restrict scheduled OHLQ inventory/product discovery, Production Forecasting sources/refresh, sales-status updates, restaurant assessments, research/score refresh, retail market intelligence, calendar sync, digests and communications consumers to org_echo_spirits. Reject explicit foreign worker targets before credential reads or writes. Remove the digest fallback for platform administrators without Echo membership.
- Keep shared Account/Brand Master and raw sales ingestion, global wholesale match-evidence claims, canonical Worklist/calendar lifecycle, audit provenance, retries/leases/checkpoints and environment/feature gates. Preserve outside records and stored connections; mailbox expiry touches Echo only. Outside SMS callbacks cannot decrypt credentials or mutate messages/consent; verified Echo STOP processing remains intact.
- Read-only TST audit: Echo alone has configured OHLQ credentials and one open research run; all organizations have zero calendar/mailbox/SMS connections. No live worker/import/send, credential repair, provider activation/disconnection, configuration mutation or schema migration was performed. Existing cron schedules remain unchanged.
- Version remains 0.2.3. TST only; production main is unchanged. Full Echo-only production readiness is not claimed. Remaining legacy role/Support paths, old setup scripts, public-share access and retention/export decisions require subsequent review.
- Validation: 927 passing tests, typecheck/build and live deployment health; detailed checks and delivery receipt are recorded with [increment 3](echo-only-transition-validation.md#increment-3-background-processing).

## TST transition: retire the customer platform console (2026-10-28)

- Remove company creation/list/detail pages, onboarding/provisioning actions and service, initial-customer invitation controls, and Support View endpoints. Removed routes return not found; existing company/user/history rows are retained.
- Consolidate navigation around Echo Settings, Users, User activity, Weekly Digest and System diagnostics. Retain product selection at its Echo administration path. Move state-access and Vendor ID maintenance into Echo Settings with server-derived ownership and audited writes; submitted company IDs and role fields are ignored.
- Owner explicitly selected **Make them Echo-admin tools** for former platform-only maintenance. Introduce a dedicated Echo-membership plus admin guard only at approved OHLQ imports, shared account edits/hours/merges and Account Research entry points. CSV writes and merge transactions also check Echo membership. Preserve validation, tenant-owned contacts, merge provenance, state restrictions, assessment/calendar/revalidation side effects and environment gates.
- Remove the Production Forecasting company picker and global role override; every role must use active, entitled Echo context. Unknown/foreign targets fail before source imports. Pilot flags and forecast data remain unchanged.
- Version 0.2.3, TST only. No migration, data deletion/reassignment, credential/entitlement/environment change, import dispatch or provider activation. Legacy role values and historical platform tables remain for later cleanup.
- Validation and scope: [transition receipt](echo-only-transition-validation.md). Relevant commit: titled Retire customer onboarding and keep Echo administration.
- Production readiness: incremental TST delivery only. Background dispatchers and remaining legacy Support/activity role paths require follow-up before a full Echo-only production candidate. No main push/merge or release tag.

## TST transition: Echo-only interactive access (2026-10-28)

- Description: first incremental step toward an Echo-only application. Sign-in, new and existing sessions, account-state request scope, invitation display/acceptance and password recovery require Echo membership. A platform role or Echo email domain cannot bypass membership. Support View cookies cannot select another organization.
- User-visible: sign-in identifies the Echo Spirits account. Outside credentials use the existing generic failure; old outside invitation/reset links are unavailable. Existing outside cookies no longer authenticate. Echo admin, user and taster roles remain supported.
- TST account: owner-requested joe@echospirits.com, org_echo_spirits, ADMIN; pending one-time password activation. No global platform role or copied password. The setup capability is shared privately with the owner, never committed.
- Feature flag/default: fixed application access policy; enabled in this TST candidate, no environment bypass. Environment/config: none. Version remains 0.2.3.
- Migrations: none. Existing outside data, users, session rows and history remain owned by their original organizations. The only operational TST inserts are the requested new Echo user and its hashed invitation.
- Validation: [transition receipt](echo-only-transition-validation.md). Relevant commit: titled Restrict TST interactive access to Echo Spirits.
- Production readiness: first increment only; platform/onboarding UI and background dispatchers remain for later removal. No main push/merge, production database/config change, provider activation or release tag.

## TST feature: Production Forecasting (2026-10-27)

- Feature: Production Forecasting. User-visible: **Yes**. Pilot entitlement: `PRODUCTION_FORECASTING`; default **Disabled**; Echo Spirits **Enabled** by explicit organization-ID seed; other tenants remain dark, including under broad TST feature enablement.
- Description: product-first next-30-day outbound case forecasts, conservative ranges, confidence, configurable uncertainty-margin planning targets, weekly buckets, market/location drill-down, prior-year/recent trends, deterministic explanations and material exceptions. Mobile cards and desktop/tablet comparison table live under Analytics.
- Sources: native Bailment PO / Invoice CSV/TSV is primary demand; shipped date, configured Brand and DC_Name, Cases plus fractional Odd_Bottles using Cases_Bottles. Native Distribution Center Groveport/Green min/max is secondary context. Retail bottle sales and agency minimum/onHand are not substituted. A-3a Bail is included; configured Distillery Only / A-3a Dist is excluded centrally.
- Statistical methods: mean, weighted mean, exponential smoothing, seasonal naive, damped growth/seasonality and Croston SBA; rolling 30-day backtests select by common-origin MAE, with WAPE/MASE/bias and volatility/stability evidence. No LLM. Missing coverage stays unknown.
- Persistence: append-only source slices, forecast runs and product snapshots; idempotent import/run replay; actuals evaluated after complete horizon coverage. Source-posting chronology prevents future data in fitting. Audited source-revision editing is deferred; changed overlapping slices are rejected.
- Migration: `prisma/migrations/20261028010000_production_forecasting/migration.sql` (five additive tables, composite tenant foreign keys, indexes/checks, pilot enrollment). Apply only this named migration to verified TST; no blanket history replay.
- Environment/config: no new secrets or provider. Existing CRON_SECRET and cron side-effect policy; 12:30 UTC daily Workflow refresh when allowed, immediate refresh after successful source import. TST's existing disabled cron policy is preserved. Optional Organization.settings.productionForecasting.safety controls 0–30% margins; inventory is not subtracted.
- Validation: [receipt](production-forecasting-validation.md), [source/model/operations guide](../production-forecasting.md). Real full-history source exports are still needed before using live Echo forecasts for planning.
- Relevant commit: commit titled Add pilot production demand forecasting (TST SHA recorded in delivery receipt).

## TST follow-up: automated forecasting sources and historical load (2026-10-28)

- Reuse the authenticated OHLQ Actions job for tenant-scoped full-history Bailment PO / Invoice and current native Partner DC exports, followed by forecast refresh. Sources and tenants fail independently; focused productionSourcesOnly dispatch avoids unrelated imports. Existing TST schedule and app-cron gates remain intact.
- Owner supplied full 2019-onward history/current DC files and approved direct invoices using Invoice_Date, with Unspecified fulfillment for missing locations. Cases include odd-bottle equivalents; configured portfolio and Distillery Only exclusions remain authoritative.
- Add audited source versions for daily full-report reconciliation: replay/unchanged history does not duplicate demand, corrections/removals preserve earlier evidence, late revisions cannot leak into earlier backtests, and suspicious truncation fails atomically. Model version production-demand-v1.1. No new database migration.
- TST data/config: only org_echo_spirits, neon-neat-tst; historyStart=2019-01-01, directInvoices=invoice-date. Imported 6,001 normalized demand rows / 60 guidance rows; seven excluded products, 23 numeric forecasts. Previous snapshots retained. No production database/configuration change.
- Environment: existing OHLQ tenant encryption and Microsoft credentials, no new secrets. Raw exports/screenshots remain private; sanitized failure artifact adds productionSources status.
- Validation: 902 full-suite tests passed, including complete DC pagination and dispatch input validation; typecheck, optimized build, database rehearsals with actual supplied files and forecast isolation/actuals passed. Deployment and live automation receipts are recorded in [validation](production-forecasting-validation.md). Live Power BI rendering was unavailable during development; download success must be verified separately.
- Production readiness: TST pilot only; production promotion is a separate task. Version remains 0.2.3; no release tag.

## TST fix: platform-admin Production Forecasting access (2026-10-28)

- Problem: platform administrators in Neat Staging could not see the forecasting link or open Echo's pilot page because access inherited their current organization's feature flag.
- Show a direct Production Forecasting entry in desktop navigation, mobile More, Analytics and Platform administration. Platform admins can open active enrolled organizations without first entering Support View; label the selected organization and use the shared searchable picker when multiple organizations are enrolled.
- Carry organization scope through product details, return/filter links and source imports. Reauthorize explicit import targets on the server; ordinary user/admin cross-tenant targets, unknown/disabled/suspended organizations and implicit platform import targets remain blocked. Pilot flags, organization memberships and global Support View context are unchanged.
- No database migration, data backfill, new secret or environment change. Version remains 0.2.3, TST only. Production main remains out of scope.
- Validation: seven focused authorization/navigation/action cases; 909 full-suite tests passing; responsive review at 390×844 and 1440×1000, including platform navigation, organization labels/search, empty state and no page overflow. Typecheck/build and deployment receipt: [validation](production-forecasting-validation.md).

## TST fix: hide ineligible production forecast products (2026-10-28)

- Omit Distillery Only / A-3a Dist and delisted Ohio products entirely, rather than showing unavailable rows. Check current inventory classification/retained diagnostics and Brand Master status 30 on the server before loading dashboard results, totals/search, product details or new forecast runs. Active A-3a Bailment remains included. An empty portfolio now says No eligible products.
- Current Echo TST portfolio: 19 visible eligible items after removing seven Distillery Only and four delisted items. A saved snapshot cannot make an excluded product reappear; direct detail links also apply current eligibility. Historical source observations and saved forecasts remain intact.
- No migration, backfill, organization configuration, source import or environment change. TST only, version 0.2.3 unchanged; production main remains out of scope.
- Validation: focused current-status, cached-snapshot, aggregate, direct-link and market-isolation checks; database rehearsal verifies that a newly delisted product disappears immediately while its history remains retained. Final checks/deployment are recorded in [validation](production-forecasting-validation.md).
- Production readiness: not reviewed; TST pilot only, no main push/merge, release tag or version change.
