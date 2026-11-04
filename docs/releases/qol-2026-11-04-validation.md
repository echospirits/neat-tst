# Focused quality-of-life validation — November 4, 2026

Owner-authorized TST-only maintenance on stable version **0.7.0**; no new development cycle, production promotion or release tag. Isolated branch `codex/qol-followups-20261104` starts from fetched `staging/tst` application/history commit `78061800`. Unrelated edits in the primary working folder are preserved.

## Behavior audit

Physical Visit capture previously required an explicit Yes/No decision for each eligible assigned Worklist item before saving. Selected completions used a direct update in the Visit transaction. The originating item was linked to the Visit, not silently completed. No blanket completion of every account task was found. Physical Visits now ignore legacy pre-save completion inputs; the optional post-save sheet delegates explicit selections to the normal Worklist completion action, with tenant/account/assignment/status revalidation and preserved calendar/history behavior. Nonphysical conversation behavior remains unchanged.

The old confirmation page could interrupt with **Mark actioned / Keep open** for an originating Opportunity. Its confirmation-only state mutation and UI are removed; Visit relationships/events and independent Opportunity workflows remain.

Agency Overview reads authoritative `Agency.agencyId` and the existing `OhlqAgencyInventoryCurrent` service, with explicit organization and organization-owned/represented product configuration. Inventory is no longer hidden behind Intelligence access or duplicated there. Missing stock/minimums remain unknown, and source freshness/empty/error states remain visible.

The Schedule week tray previously used independent inline-grid items capped at 240px. Shared list containers now provide one aligned column with uniform gaps across day/week/empty-day/mobile; task actions retain their handlers. Worklist table rows also constrain wrapping and mobile grid width.

Reactivation retains its existing date-only 90/30-day windows and commercial/pursuit gates. Assignment uses canonical lowercase `wholesale` LoggedVisits and stable `createdByUserId` relationships, filtering active same-organization assignable users and future visits. The resolver supports each organization's own fallback; the legacy Echo purchase-state automation fails closed for other organizations. Existing valid owners and closed history are retained; invalid active owners are repaired conditionally, and a tenant-unique submission key protects new lapse conditions from concurrent imports.

## TST data/configuration evidence

- Verified Neon project `dawn-frog-33352119` (`neat-crm-tst`), branch `br-divine-forest-avwq2b3g`, database `neondb`; separate production project untouched.
- TST initially had no James user. The owner explicitly authorized account creation and supplied James Clifford / `james@echospirits.com`. Created active standard `USER` ID `usr_james_clifford_tst_20261104` in `org_echo_spirits`; its existing JSON `settings.defaultReactivationAssigneeUserId` now equals that ID. Transaction readback verified organization, user, email and role. Audit event `audit_qol_reactivation_20261104` records the change under the existing Echo administrator. No password, invitation, email or calendar/provider change.
- Read-only source comparison at Arena Wine & Spirits (`cmtzof222006glb04vqaybs4m`) found authoritative Agency **30748** and nine current Echo organization products dated November 3, 2026. Example on-hand/minimums: rum **47/44**, spiced rum **30/28**, vodka **28/9**, rye **0/9**; genuine zero inventory remains distinct from missing data.
- No schema/migration, backfill, dependency, feature-flag or hosted environment change. Production requires its own verified fallback member ID if separately promoted; TST user IDs are not portable configuration.

## Validation and delivery

- Focused behavioral/security regression set: **117 passing**, 13 suites, no failures (`output/qol-20261104/focused-final.log`). Covers Visit creation and explicit completion/history/calendar, task/assignment/tenant boundaries, current inventory scope and Ohio identity, unchanged qualification windows, latest Visit/fallback ownership, repeated/concurrent imports and preserved completed follow-ups.
- Completed full suite: **1,028 passing**, 76 suites, no failures/skips/cancellations (`output/qol-20261104/tests.log`). Obsolete Opportunity-interruption tests were replaced with the new behavior/security coverage; unique lifecycle and authorization assertions are retained.
- Strict typecheck and optimized build: **passed** (`typecheck-final.log`, `build-final.log`). Initial checks caught two regression-fixture type declarations; fixed before the completed gates. Exact lockfile installed; no dependency/version changes.
- Actual hydrated component acceptance: **30 captures** at 320 x 844, 390 x 844 and 1440 x 900 in light/dark, zero page overflow/runtime errors, uniform task-list edges and 8px gaps, checked mobile controls at least 44px. Actual prompt one/all/dismiss/Escape/pending/error/empty/success interactions and Schedule Complete/Save schedule handlers pass. Screenshots were visually inspected. `scripts/qol-browser.ts` uses synthetic data with Next Link/router and React 18 form-status adapters, retaining actual hooks, forms and pending context. These fixture actions do not mutate CRM/provider state. Evidence: `output/playwright/qol-20261104/results.json`.
- One mechanical UI detector run returned no findings for the changed targets. Shared source review checked server authorization, canonical Worklist side effects, nullable relation filtering and safe completion replay.
- Schema, migrations, package/lock and GitHub workflows unchanged; no migration gate is required for a JSON setting.

Hosted TST delivery and authenticated acceptance are recorded after deployment. Component fixtures and source verification are not a claim of every provider/role/device combination or physical-phone acceptance.
