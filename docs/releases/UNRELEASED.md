# Unreleased — 0.13.0 candidates

This manifest is the repository-backed record of work in TST that may be included in Neat `0.13.0`. Nothing listed here is released until a separate production release task promotes and tags the exact tested state.

- Production release baseline: `0.12.0` (provided for this cycle; the production repository does not yet contain the version framework needed to verify it in-app).
- TST development version: `0.13.0-dev`.
- Previous-manifest audit: `docs/releases/0.12.0.md` is not present in Git. Do not reconstruct or overwrite historical release contents without an evidence-backed release manifest.

## Entry template

### Feature/change name

- Description: What changed and why.
- Relevant commit(s): Short SHA(s) from TST.
- Feature flag: Key, or `None`.
- Default flag state: Enabled, disabled, pilot-only, or `N/A`.
- Migration(s): Path(s), or `None`.
- Environment/config: New or changed variable names, or `None` (never include values or secrets).
- User-visible: Yes or no.
- Production readiness: Ready, blocked, or not reviewed, with a short reason.
- Rollout notes: Anything the release operator must do, or `None`.

## Pending changes carried into the 0.13.0 cycle

### All-feature staging entitlements

- Description: Every tenant in APP_ENV=test receives all registered capabilities, including pilots. Organization and role authorization still applies; production package defaults are unchanged. New tenant creation, plan saves, and staging seed retain this policy.
- Relevant commit(s): `a65695f4`.
- Feature flag: All registered organization features, test environment only.
- Default flag state: Enabled in test; existing defaults in production.
- Migration(s): None.
- Environment/config: Existing APP_ENV=test; no new variables.
- User-visible: Yes.
- Production readiness: Test policy only; 475 tests and typecheck passed. No production data changed.
- Rollout notes: Ran `npm run enable:staging-features -- --env-file=<test-env-file>` on neon-neat-tst; all 3 tenants have all 17 features enabled. Repeat after adding features so persisted entitlements used by background jobs remain synchronized. External side-effect controls remain in force.

### Account Sales Status / Pipeline

- Status-filter visual polish (`48ce510b`): remove enclosing borders, raised shadows, and persistent selection outlines from the top filter boxes; retain colored arrows, filter icons, Selected labels, hover feedback, and keyboard-only focus rings. CSS-only; no schema/configuration changes. 8 focused tests and deployed desktop/mobile visual checks passed.
- Snapshot visual polish (`0e69b071`): remove the outer Kanban group borders; preserve colored headers, counts, chevrons, collapsed defaults, top filter styling, and keyboard focus indicators. CSS-only; no schema/configuration changes. 8 focused tests and deployed mobile/desktop review passed.
- Pipeline disclosure follow-up (`6de381a9`): Kanban is the default (List remains secondary). Snapshot status headers are keyboard-accessible native disclosures, all collapsed initially, with counts and rotating chevrons. Top status filters gain raised borders, filter icons, and hover/focus feedback; filtering preserves the selected view. No migration/environment/entitlement changes. Validation: 8 focused tests, typecheck, build, and deployed 1440 x 900 / 390 x 844 review passed, including default collapse, mouse/keyboard toggles, empty groups, filtering, List recovery, and no mobile horizontal overflow. TST deployment Ready; production not promoted.
- Wholesale usability follow-up: color progress only through the current stage, mute later stages, remove the selection box, and use a single 24px numbered arrow strip on mobile with the full current label beneath. Show Edit and eligible Merge actions directly; remove the wholesale Voice note shortcut. Pipeline filters/board and Agency presentation remain unchanged. No migration/environment changes.

- Description: Adds tenant-owned Agency and Wholesale Sales Status, immutable status history, inline account and Log Visit updates, objective Buying State, deterministic Needs Attention rules, imported-sales transitions to Purchasing, account activity events, and a lightweight responsive Pipeline page. Follow-up adds shared color-coded stage arrows on account/Pipeline pages and a Kanban board alongside the existing List view, preserving status filters. Nurture/Lost remain separate from forward progression. This remains independent of Intelligence Opportunities.
- Relevant commit(s): `67c61f44` (pilot), `8fca96ff` (stage arrows and Kanban), `bcecf92f` (compact wholesale progress and direct actions).
- Feature flag: `ACCOUNT_SALES_STATUS`.
- Default flag state: Disabled in production by default; enabled for Echo Spirits through the organization entitlement migration/bootstrap mechanism. All test-environment tenants are enabled under the staging entitlement policy above.
- Migration(s): `prisma/migrations/20260922120000_account_sales_status/migration.sql`.
- Environment/config: None.
- User-visible: Yes.
- Production readiness: Not reviewed for production; full tests, typecheck, build, tenant/feature/idempotency audits, and the TST schema postflight passed. Follow-up: 30 focused tests, typecheck, and build passed; deployed 1440 x 900 and 390 x 844 browser review passed for arrows, Kanban/List switching, status filters, empty recovery, and account links. Wholesale compact follow-up: 7 focused tests, typecheck, build, and deployed desktop/mobile review passed; mobile status area reduced from 546px to 164px, with 24px arrows. Confirmed progression shading, no current-stage outline, direct Edit, and no Voice note shortcut. No horizontal mobile page overflow.
- Rollout notes: Pilot feature. Apply the additive migration before deploying application code. No backfill is required; existing tracked wholesale purchase events are reused, and future successful imports reconcile eligible tracked accounts. The additive `20260917120000_agency_store_context` prerequisite was applied to TST with the Target / Targeting deployment.

### Lightweight release and version framework

- Description: Adds canonical application versioning, release process/checklist documentation, a structured unreleased manifest, a read-only Git release audit, and a subtle version display in protected environment diagnostics.
- Relevant commit(s): `f6166065`.
- Feature flag: None.
- Default flag state: N/A.
- Migration(s): None.
- Environment/config: None.
- User-visible: Yes; administrators can see the version in Environment diagnostics.
- Production readiness: Not reviewed; this task publishes to TST only.
- Rollout notes: No application feature changes or production promotion are included. Production must use a separate release task.

### Consistent compact sidebar

- Description: Uses consistent uppercase section headings, moderate link spacing, and a compact account footer. Administration starts collapsed and expands inline below its heading. The default platform-admin sidebar fits 1366 x 768 and 1440 x 900 without scrolling; expanded administration remains scroll-accessible on shorter screens. Mobile retains touch-sized links.
- Relevant commit(s): `94b040c6`; follow-up commit titled `Refine sidebar spacing and expand administration inline`.
- Feature flag: None; existing role and feature visibility preserved.
- Default flag state: N/A.
- Migration(s): None.
- Environment/config: None.
- User-visible: Yes.
- Production readiness: Navigation tests (9), typecheck, and rendered-component desktop/mobile checks passed; separate production release review required.
- Rollout notes: TST only. Scrolling remains available for unusually short windows or enlarged text.

### Direct account address and phone links

- Description: Removes the Contact dropdown from Wholesale and Agency detail pages. Addresses link directly to maps in detail pages and directories; displayed account phone numbers link to the calling app. Links have visible underlines and 44px touch targets, with explicit unavailable text for missing values.
- Relevant commit(s): Commit titled `Make account addresses and phone numbers directly actionable`.
- Feature flag: None.
- Default flag state: N/A.
- Migration(s): None.
- Environment/config: None.
- User-visible: Yes.
- Production readiness: Typecheck and rendered-component checks at 390 x 844 and 1440 x 900 passed, including missing values, link destinations, touch target height, and no horizontal overflow. Native app handoff requires physical-device verification; separate production release review required.
- Rollout notes: TST 0.13.0-dev only. Android uses its geo URI handler, Apple devices use Maps links, and other browsers retain web directions as a fallback. Device/browser settings determine the app that handles external links.

### Objective traffic-weighted account research and opportunity scoring

- Description: Advances opportunity ranking to `ACCOUNT_FIT_V6` and research-only discovery to `RESEARCH_FIT_V2`. Account research now captures evidence-backed foot-traffic signals, private dining, venue type, and hotel meeting-space square footage. Research-only scoring gives direct traffic evidence and verified review counts the largest weight, limits subjective star ratings to two points, rewards patio/private-dining capacity indicators, and gives a large meeting-space contribution only to a bar or restaurant inside that exact hotel property.
- Relevant commit(s): Commit titled `Weight objective traffic in opportunity scoring`.
- Feature flag: Existing `ADVANCED_INTELLIGENCE` / `WHOLESALE_OPPORTUNITIES` entitlements.
- Default flag state: Existing entitlement behavior; all TST tenants enabled under the staging policy.
- Migration(s): None. New structured fields are stored in the existing research identity snapshot; private dining uses its existing column.
- Environment/config: None.
- User-visible: Yes; score explanations identify objective traffic, review volume, venue attributes, and the intentionally small star-rating contribution. Research-only scores remain labeled provisional.
- Production readiness: Ready for TST evaluation; 48 focused research, scoring, tenant-scope, and presentation tests, typecheck, and an isolated production build passed.
- Rollout notes: TST only. Existing research immediately benefits from the new review-count weighting after V6 recalculation. Foot-traffic, venue-type, and hotel meeting-space points appear after a new research refresh captures their structured evidence. Run `npm run recalculate:opportunities:v6` in the intended environment to rescore preserved tenant opportunities without changing pursued, dismissed, or snoozed statuses.

### Target / Targeting Accounts

- Description: Replaces user-facing Pursuing terminology with Target Account / Targeting. Targeting is an organization-owned core CRM account overlay, available without Intelligence, and can be initiated on account pages, Log Visit, Wholesale Opportunities, and Agency Intelligence. Targeting updates Sales Status to TARGET where enabled, preserves established relationship statuses, and prioritizes wholesale accounts for refreshed public research. Agency targeting re-runs the existing agency intelligence pipeline for that account when complete inputs are available; targeted agencies are also included in the next tenant inventory refresh for core-only organizations. The prior actioned-opportunity state and its worklist/research behavior remain intact.
- Relevant commit(s): Pending.
- Feature flag: None for account targeting; existing Intelligence entitlements remain required for Intelligence pages.
- Default flag state: Available to all organizations.
- Migration(s): `prisma/migrations/20260923120000_account_targeting/migration.sql`.
- Environment/config: None.
- User-visible: Yes.
- Production readiness: Not reviewed; TST feature development only.
- Rollout notes: Tenant-specific target state and history. Agency refresh uses the existing OHLQ intelligence workflow and waits for complete sales and inventory inputs; failures are logged without undoing the targeting action. Apply the previously pending additive `20260917120000_agency_store_context` migration and this feature migration before deploying code.
