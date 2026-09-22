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

- Wholesale usability follow-up: color progress only through the current stage, mute later stages, remove the selection box, and use a single 24px numbered arrow strip on mobile with the full current label beneath. Show Edit and eligible Merge actions directly; remove the wholesale Voice note shortcut. Pipeline filters/board and Agency presentation remain unchanged. No migration/environment changes.

- Description: Adds tenant-owned Agency and Wholesale Sales Status, immutable status history, inline account and Log Visit updates, objective Buying State, deterministic Needs Attention rules, imported-sales transitions to Purchasing, account activity events, and a lightweight responsive Pipeline page. Follow-up adds shared color-coded stage arrows on account/Pipeline pages and a Kanban board alongside the existing List view, preserving status filters. Nurture/Lost remain separate from forward progression. This remains independent of Intelligence Opportunities.
- Relevant commit(s): `67c61f44` (pilot), `8fca96ff` (stage arrows and Kanban), `bcecf92f` (compact wholesale progress and direct actions).
- Feature flag: `ACCOUNT_SALES_STATUS`.
- Default flag state: Disabled in production by default; enabled for Echo Spirits through the organization entitlement migration/bootstrap mechanism. All test-environment tenants are enabled under the staging entitlement policy above.
- Migration(s): `prisma/migrations/20260922120000_account_sales_status/migration.sql`.
- Environment/config: None.
- User-visible: Yes.
- Production readiness: Not reviewed for production; full tests, typecheck, build, tenant/feature/idempotency audits, and the TST schema postflight passed. Follow-up: 30 focused tests, typecheck, and build passed; deployed 1440 x 900 and 390 x 844 browser review passed for arrows, Kanban/List switching, status filters, empty recovery, and account links. Wholesale compact follow-up: 7 focused tests, typecheck, build, and deployed desktop/mobile review passed; mobile status area reduced from 546px to 164px, with 24px arrows. Confirmed progression shading, no current-stage outline, direct Edit, and no Voice note shortcut. No horizontal mobile page overflow.
- Rollout notes: Pilot feature. Apply the additive migration before deploying application code. No backfill is required; existing tracked wholesale purchase events are reused, and future successful imports reconcile eligible tracked accounts. TST retains a pre-existing unapplied `20260917120000_agency_store_context` migration-history entry that was not modified by this feature.

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

- Description: Uses four matching, always-visible navigation sections with consistent typography and title casing; removes nested administration headings and compacts the account footer. Full platform-admin navigation fits 1366 x 768 and 1440 x 900 without scrolling; mobile retains touch-sized links.
- Relevant commit(s): Commit titled `Standardize and compact sidebar navigation`.
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
