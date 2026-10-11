# Unreleased — v0.2 candidates

The v0.2 development cycle opened on 2026-10-08, immediately after the verified 0.14 production release. Normal development targets only neat-tst/tst. A future production release requires separate explicit authorization.

- TST development version: `0.2.0-dev`.
- Verified production baseline: `0.14.0`, tag `v0.14.0`, commit `574bfd0c02c4246ae2a966d86a8a1f96264b3c40`.
- TST opening base: `1d66a79ce361f2b6a3aee8f6a9f2865927682f54`; complete tree matches production `cde62a7b3470631069bd519dfd2a1c6147bee052`.
- Previous release: [archive](0.14.0.md), [user notes](0.14.0-user-notes.md), [validation](0.14.0-validation.md), [checklist](0.14.0-checklist.md).
- Current cycle: [plan](0.2.0-plan.md), [pending checklist](0.2.0-checklist.md), [validation](0.2.0-validation.md).
- Candidate: not selected. Security fixes below are included in the development package; the owner-selected numbering is intentional and historical version records are retained.

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

### Browse every recent wholesale purchase

- Description: Recent wholesale purchases now rank aggregated bottle totals highest first, then product name A-Z, with item code breaking exact ties. Both tracked products and all purchases support independent Previous/Next navigation in groups of 50 through the final item, with visible ranges and controls above and below each list.
- Relevant commit(s): Commit titled Sort and paginate recent wholesale purchases for v0.2.
- Feature flag/default state: None / N/A; existing account access and tenant product filters are preserved.
- Migration(s): None.
- Environment/config: None; version remains `0.2.0-dev`.
- User-visible: Yes. Paging preserves the open account and purchase disclosure, returns focus to the list navigation, and retains whole-window summary totals.
- Production readiness: TST verification recorded in [v0.2 validation](0.2.0-validation.md); future production candidate review remains separate.
- Rollout notes: neat-tst/tst only. The existing account/window query already loads all matching purchase rows; all aggregated product summaries now reach the client, which displays 50 at a time without additional network requests. No database changes or live account mutations.

### Wholesale commercial opportunity stars

- Description: Replaces the active wholesale attention score with tenant-specific integer 0–5 commercial opportunity stars and a separate unrated state. Sales-backed ratings use absolute compatible product depth, repeated purchasing where observed, and supporting core volume. Research-only ratings use saved location-scale and price-fit evidence. Buyer access, activity, pursuit state, strategic multipliers and automatic product pitches do not affect commercial grading. Retail-agency scoring is unchanged.
- Relevant commit(s): Commit titled `Implement wholesale commercial opportunity stars` on neat-tst/tst.
- Feature flag/default state: Existing `WHOLESALE_OPPORTUNITIES` entitlements; no new grants or defaults.
- Migration(s): `20261011010000_wholesale_commercial_stars`, additive rating/status/reason/run fields, account-level follow-up enum and audit snapshots, including preserved legacy assessments.
- Environment/config: Version remains `0.2.0-dev`; no new secrets or provider permissions. Model and fixed calibration boundaries are documented under [wholesale-scoring](../wholesale-scoring/00-WHOLESALE-SCORING-CHARTER.md).
- User-visible: Shared read-only stars in wholesale directory, account and linked summaries, search, opportunity discovery and dashboard summaries. Rating-based sorting spans evidence modes; zero/unrated remain explicitly discoverable. Default actions retain snooze/dismissal and tenant/account boundaries.
- Production readiness: Pending a separately authorized frozen release; implementation validation is recorded in [v0.2 validation](0.2.0-validation.md).
- Rollout notes: Apply only the reviewed additive migration, verify TST host, and recalculate all enabled tenants from saved inputs. Preserve ledger, research, manual tasks and chosen pursuits. Failed refreshes retain last valid assessments. Roll back application writers only with jobs paused; keep schema/snapshots and prefer a forward scoring repair.

### Preserve shared wholesale identity during account and visit creation

- Description: Fixes Codex Security Cloud finding `csf_833295095d8454e0959a5569`. The wholesale creation and visit creation actions now reuse a matched shared account without updating canonical fields, reactivating the record, resetting geocodes, replacing its official link, or synchronizing its licensee IDs. Dedicated canonical editing and merging retain their Platform Admin authorization.
- Relevant commit(s): Commit titled `Preserve shared wholesale identity during creation` on neat-tst/tst.
- Feature flag/default state: None / N/A; preservation is mandatory for every caller, including Platform Admin submissions through these creation flows.
- Migration(s): None.
- Environment/config: None; dependencies and version `0.2.0-dev` unchanged.
- User-visible: Existing accounts keep their canonical identity when matched by primary/secondary licensee IDs or the visit flow's manual name/address lookup. Tenant visits, contacts, tags, sales status and targeting still attach to the matched account. Nonmatching prospect creation retains its existing behavior. Account corrections use the Platform Admin edit workflow.
- Validation: Actual action regressions across two organizations and USER/ADMIN/PLATFORM_ADMIN callers, signed-out/taster controls, conflicting/ambiguous matches, inactive records and new prospects are recorded in [v0.2 validation](0.2.0-validation.md).
- Production readiness: TST implementation validation recorded below; frozen v0.2 candidate review and production promotion remain pending.
- Rollout notes: neat-tst/tst only. No historical data recovery, migration, backfill, new prospect-ownership schema or tenant canonical-correction overlay is introduced. Submitted canonical corrections and additional licensee IDs are ignored when creation matches an existing account; platform curation must apply any intended correction.

### Preserve wholesale names and corrected public addresses through imports

- Description: Account Master imports preserve every existing wholesale name, including inactive/reactivated accounts. Street address, city and ZIP have independent persistent protections: manual edits (including intentional clearing) survive later imports, while untouched fields continue refreshing. Existing differences from linked stored OHLQ records are protected by the migration; known user-created unlinked accounts retain their populated fields.
- Relevant commit(s): TST implementation `52dff23d0eefb6d5198eadf676b50264e58744a9`; selective current-version production patch `af1f396726e3b15e1167f5af2aa6ba426cae9bf9`.
- Feature flag/default state: None / enabled after the migration and code deployment.
- Migration(s): `prisma/migrations/20261010160000_wholesale_address_import_protection/migration.sql`; additive default-false field protections plus the existing-difference backfill. Apply before the code and before another Account Master import. No account values, names or geocodes are changed by the migration.
- Environment/config: No runtime configuration, dependency or provider change. The optional temporary-table verification script uses `WHOLESALE_IMPORT_TEST_DATABASE_URL` for the explicitly verified TST host only.
- User-visible: Yes. Edit Account explains name preservation and per-field address protection. Protection carries through manual creation, official relinking, account merges and target-workbook imports. A later manual correction remains editable and protected.
- Validation: Full integrated suite 756/756, clean nonincremental TypeScript, optimized build and diff checks passed. Thirteen PostgreSQL checks exercised the actual migration and parameterized importer using temporary tables in an always-rolled-back transaction. Source-rendered mobile/desktop previews passed. Concurrent TST creation-isolation protections are retained. [Evidence and limits](0.2.0-wholesale-import-protection-validation.md).
- Production readiness: Owner authorized this feature alone as an immediate current-version patch. Production candidate passed 623/623 tests, clean types, optimized build, responsive previews and production-data migration rehearsal. Final live deployment/health evidence is recorded in the linked receipt; the broader frozen v0.2 candidate remains pending.
- Rollout notes: Only this migration was applied and registered on verified TST and production targets. TST retained all 15,745 original rows/values with zero initial protection differences. Production retained all 16,136 original rows/values and protected 109 addresses, 109 cities and 97 ZIPs, with zero backfill mismatches. The pre-existing TST password-reset migration-ledger gap was left unchanged. Versions stay production 0.14.0 / TST 0.2.0-dev by explicit owner request; no new/moved tag. The raw OHLQ Account record still refreshes separately; active-status/import-presence rules and other operational fields are unchanged. Existing differences are preserved without claiming who changed them; previously overwritten corrections cannot be recovered from current records. All other TST features remain separately pending.

### Ticket creation for every role and visible screenshot upload

- Description: Fixes the missing new-ticket action for Platform Admin. Every Support queue now has a prominent New support ticket button, including My tickets; the Platform dashboard also links directly to creation. Platform Admin can search/select an organization on the form without entering Support View. Tenant users, org admins and tasters retain authenticated organization ownership. Screenshot upload is visible on the form, with preparation, preview and removal before sending.
- Relevant commit(s): Commit titled `Enable support ticket creation for every role with visible screenshot upload` on neat-tst/tst.
- Feature flag/default state: None / Core CRM. Existing `FILE_UPLOADS_ENABLED` remains the screenshot gate and was confirmed true on the live neat-tst project's hosting environment through the CLI's read-only API fallback.
- Migration(s): None.
- Environment/config: No new or modified variable, secret, dependency or provider.
- User-visible: Yes. Support → New support ticket → Screenshot (optional) → Send ticket. Platform Admin selects an organization, with known context preselected when available. Changing the report organization omits recent-page context from the previous organization. Failed submission keeps the text, organization and screenshot.
- Validation: Full suite 731/731, including 25 focused support/entry/HTTP tests, typecheck and optimized build passed. Actual built-app Playwright checks with local fixture users created and viewed screenshot tickets for regular users, Core-only users, org admins, tasters and platform admins at 390 × 844 and 1440 × 900. Platform without home/Support View context, organization live search, invalid-image validation, pending/disabled submission, retry recovery, private image delivery and no horizontal overflow passed. [Evidence](0.2.0-support-validation.md).
- Production readiness: TST validation complete; the frozen v0.2 candidate and separately authorized production promotion remain pending.
- Rollout notes: No live support tickets or temporary shared-TST sessions were created. Only Platform Admin may select the target organization; authority and organization existence are checked inside the write transaction. No migration/backfill required.

### Core CRM Support and desktop sidebar placement

- Description: Moves desktop Support into the sidebar user card directly below Profile & preferences for every role, separating it from Intelligence navigation. Core CRM's canonical description and both Platform Admin plan forms explicitly include in-app Support. Authenticated Support remains available without the Intelligence add-on or a separate feature toggle.
- Relevant commit(s): Commit titled `Place Support beside Profile and clarify Core CRM inclusion` on neat-tst/tst.
- Feature flag/default state: None / included with Core CRM and available to every authenticated role.
- Migration(s): None.
- Environment/config: None.
- User-visible: Yes. Desktop Support is beside Profile & preferences; mobile More and the taster tab bar retain their existing Support links. Core CRM plan descriptions now list Support.
- Validation: All 11 existing navigation/configuration tests, typecheck, optimized build and diff checks passed. Playwright checked the actual built app with local fixture users at 390 × 844 and 1440 × 900: desktop footer placement for regular, Core-only, platform and taster users, working links, separation from Intelligence, mobile More close-on-navigation, taster mobile access, Core plan copy and no horizontal page overflow. Mobile/desktop screenshots were visually reviewed.
- Production readiness: TST validation complete; the normal frozen v0.2 candidate and separately authorized production promotion remain pending.
- Rollout notes: No database, entitlement-row or provider change. Support already permits Core-only users; this change makes the package inclusion explicit and corrects desktop placement.

### In-app support reporting and platform queue

- Description: Adds Support outside the sales Worklist: four report categories, an optional reviewed screenshot and recent-page/browser context, ticket history, organization-admin visibility, and a tenant-safe global Platform Admin queue with live filters and optional urgency. Platform responses include status and an optional anticipated fix date. Reporters see the answer in an authenticated banner until acknowledging it; replies can reopen completed tickets. Private platform notes are never exposed to tenants.
- Relevant commit(s): `5f08efec316ac81ed07b742234679b6f32e67523` (`Add in-app support reporting and platform queue`) on neat-tst/tst.
- Feature flag/default state: None / available to every authenticated role, including tasters. Existing `FILE_UPLOADS_ENABLED` controls optional screenshots; text reports remain available when uploads are disabled.
- Migration(s): `prisma/migrations/20261009010000_support_tickets/migration.sql`; additive support tables, enums, indexes and foreign keys, plus a 600 KiB raster-image database constraint. Apply before deploying the support code.
- Environment/config: No new variable, dependency, provider or secret. Screenshots are stored in a separate database table and delivered through authenticated private/no-store routes, with no public Blob URL.
- User-visible: Yes. Support appears in desktop navigation/mobile More and on the Platform dashboard. Organization admins can review their users' reports; only the reporter and Platform Admin can reply. Status/date/response history is preserved. Complete requires an answer; Fix planned requires an estimated date.
- Validation: 725/725 tests passed, including 19 focused support authorization, lifecycle, privacy and HTTP tests. Typecheck and the optimized application build passed. Browser checks used the built app with local fixture users/database at 390 × 844 and 1440 × 900; details are in [support validation](0.2.0-support-validation.md).
- Production readiness: TST deployment READY and live health verified against `environment=test` / `databaseTarget=neon-neat-tst`; the normal frozen v0.2 candidate and separately authorized production promotion remain pending.
- Rollout notes: Support migration applied and registered only on the host-verified `neon-neat-tst` target. The pre-existing `20260923123000_password_reset_tokens` migration-ledger gap was observed and left unchanged. No live support tickets or temporary shared-TST admin sessions were created. Screenshot storage is bounded per report and manually removable; no automatic retention job or session-replay provider is introduced. [Operator/user guide](../SUPPORT.md).

### Keep authenticated OHLQ exports out of Actions artifacts

- Description: Confirms and fixes Codex Security finding `csf_96a7e38554f8a796188f399d` / `occ_91e5c24770291ad1ac616140`. All authenticated report downloads and browser screenshots use private `RUNNER_TEMP/ohlq-private` storage in GitHub Actions, including caller-supplied output overrides. Failure artifacts contain only a newly generated `status.json` with fixed step names and allowlisted status values, retained for one day. Successful runs publish no diagnostic artifact.
- Relevant commit(s): Commit titled Keep authenticated OHLQ exports out of Actions artifacts.
- Feature flag/default state: None / N/A.
- Migration(s): None.
- Environment/config: Existing GitHub Actions `GITHUB_ACTIONS` and absolute `RUNNER_TEMP` are required for CI private storage; no new secret or operator configuration. Local and serverless download defaults remain supported.
- User-visible: No application UI change. Actions artifacts change from raw debug files to sanitized failure statuses.
- Production readiness: Pending v0.2 candidate review; regression tests and local verification recorded in the v0.2 validation record.
- Rollout notes: v0.2 development scope. This prevents future raw artifact uploads; previously published debug artifacts retain their existing expiry and access settings. No live OHLQ import or workflow dispatch is required for verification.

### Prevent shell injection in tenant OHLQ credential repair

- Description: Verified Codex Security finding `csf_7228e69812aa138fc64f3d14` against the current workflow. Dispatch input now enters Bash through `TENANT_ORGANIZATION_ID` and is passed as one quoted argument. Both the workflow and repair script reject IDs outside generated CUIDs and the two existing seeded organization IDs before invoking repair or querying the database.
- Relevant commit(s): Commit titled Prevent shell injection in tenant credential repair.
- Feature flag/default state: None / N/A; existing `ohlqImport` side-effect gate remains required.
- Migration(s): None.
- Environment/config: Step-local `TENANT_ORGANIZATION_ID` binds the existing dispatch input; no new secret or deployment configuration.
- User-visible: No application UI change. Invalid repair dispatch IDs fail before the repair command runs.
- Production readiness: Implementation and focused security tests verified; pending the normal release candidate review and separately authorized production promotion.
- Rollout notes: TST only. Existing `--apply`, selected-environment match and organization-existence checks remain required. No workflow dispatch, database access or credential mutation was performed during verification.

### Restrict shared wholesale merges to platform administrators

- Description: Remediates Codex Security finding `csf_bb970f0d2d7159e0c51ddc92` by requiring platform authority for the page, action, candidate discovery, preview and merge service. The transaction rechecks the authenticated actor's current active status and role. Tenant admins cannot read cross-organization merge previews or mutate shared accounts through this workflow.
- Relevant commit(s): Commit titled Restrict shared wholesale merges to platform administrators.
- Data integrity: Tag and recipe duplicate removal matches organization plus tag/recipe identity. Global platform merges retain each row's organization ownership and keep existing eligibility, conflict and serializable transaction protections.
- Audit: Existing source tombstone records the authenticated actor, timestamp and account snapshot; `mergeSnapshot.mergeAudit` adds source/destination IDs, all-organizations scope, per-model moved counts and duplicate removal counts. Caller-supplied actor IDs are no longer accepted.
- Feature flag/default state: None / N/A; authorization applies to every merge.
- Migration(s): None; additive audit data uses the existing JSON field.
- Environment/config: None; dependencies and version remain `0.2.0-dev`.
- User-visible: Tenant admins no longer see Merge account; platform administrators see an explicit permanent, all-organizations confirmation.
- Validation: 623/623 tests and TypeScript check passed on the isolated fix; after preserving concurrent security fixes, the combined suite passed 636/636. Coverage includes unauthorized direct service/page/action calls, stale authority, forged actor, tenant duplicate preservation, conflict and success/replay. Build, responsive mock rendering and TST deployment evidence are recorded in [validation](0.2.0-validation.md).
- Production readiness: Security fix locally validated; stable v0.2 release candidate gates remain pending.
- Rollout notes: TST-only delivery for v0.2. No migration, backfill, provider activation, production push or production tag. Existing historical merges are not repaired by this change; review their existing actor/snapshot evidence separately if needed.
### Prevent password-recovery account enumeration through response timing

- Description: Every valid forgot-password request schedules the full account lookup, cooldown check, token transaction and email delivery with Next.js `after`. The generic 202 response is sent before any account-dependent database or provider I/O; eligible, missing, inactive, passwordless and cooldown accounts share the same public response path.
- Relevant commit(s): Commit titled Prevent password reset response timing enumeration.
- Security finding: `csf_23dbd4c9bc6d0567ca8998e5`, occurrence `occ_0a70f77cd798368047145955` (CWE-208). Verified against current TST source; report and repository content treated as untrusted evidence.
- Feature flag/default state: None / N/A.
- Migration(s): None.
- Environment/config: None; uses the existing Next.js/Vercel post-response lifecycle and current email delivery policy.
- User-visible: Password-recovery acknowledgement no longer waits for lookup, persistence or email delivery. Invalid-input validation, serialized issuance, cooldown, one-hour hashed tokens, prior-token invalidation and failed-delivery consumption with cooldown retention are preserved.
- Production readiness: TST verification recorded in [v0.2 validation](0.2.0-validation.md); separate production release approval required.
- Rollout notes: neat-tst/tst only, in the owner-confirmed 0.2.0-dev cycle. Background delivery remains subject to the platform invocation duration; no durable retry queue is introduced.

### Enforce organization ownership when attaching location tags

- Description: `addLocationTag` resolves the submitted tag ID within the authenticated organization before either agency or wholesale attachment. Foreign and nonexistent tag IDs return the existing invalid status without creating/updating an assignment or invalidating caches. Valid tags retain idempotent note updates and account-specific refreshes.
- Relevant commit(s): Commit titled Validate location tag ownership before account attachment.
- Security evidence: Codex Security Cloud finding `csf_7d4f95a4a58a4ccaaea8ee8a`, occurrence `occ_059cbf59e896800b9cbe328d`; confirmed against current TST source. [Validation](0.2.0-location-tag-authorization-validation.md).
- Feature flag/default state: None / N/A; existing authenticated action remains available.
- Migration(s): None; the fix enforces ownership in the action without changing database relationships.
- Environment/config: None.
- User-visible: Valid account tagging is unchanged; inaccessible tag submissions return the existing invalid status.
- Production readiness: Local validation recorded in the linked record; a frozen production candidate and release approval remain separate.
- Rollout notes: neat-tst/tst only, within the owner-confirmed 0.2.0-dev cycle. No database migration or data repair performed.

### Protect shared agency operating hours

- Description: Manual hours and public-hours research now require platform administrator authority before accessing the agency or a provider. Tenant users and tenant administrators see known hours and their source in a read-only view. Curated changes retain the authenticated actor, timestamp, and previous values, with a conditional write that prevents concurrent saves from discarding history.
- Relevant commit(s): Commit titled Restrict shared agency hours to platform curation.
- Feature flag/default state: None / N/A; existing public-research availability checks remain in effect.
- Migration(s): None; provenance and prior values use the existing businessHours JSON field.
- Environment/config: None.
- User-visible: Yes; tenant users can view shared hours, while platform administrators can save or research them.
- Production readiness: TST fix; 19 focused hours regressions, 72 combined authorization/scheduling tests, standalone TypeScript checks and responsive previews pass. Local compilation passed but final local build checks hit shared-dependency corruption; normal hosted build verification is part of delivery evidence. Production promotion requires a separate release candidate.
- Rollout notes: neat-tst/tst only. Existing hours remain readable; no backfill or live account changes. New history begins at the first curated update and preserves the value it replaces.

### OHLQ workflow dispatch input security

- Description: Pass workflow inputs and context through step environment mappings instead of inserting expressions into Bash source. Validate calendar dates, bounded decimal day counts, purchase-state mode and active date ranges before dependency installation or imports. Tenant credential repair preserves organization IDs as a single literal argument.
- Relevant commit(s): Commit titled Prevent OHLQ workflow dispatch shell injection.
- Feature flag/default state: None / N/A.
- Migration(s): None.
- Environment/config: No new hosted variables or secrets. Existing scheduled refresh defaults and GitHub Environment selection remain in use.
- User-visible: Invalid dispatch inputs fail before imports; valid single-date, recent-days and purchase-state imports preserve their arguments.
- Production readiness: Fix verified locally with credential-free Bash regression tests; production promotion requires separate authorization.
- Rollout notes: neat-tst/tst only. Normal imports accept days 1-30; purchase-state-only accepts days 1-120. Dates must be real calendar dates formatted YYYY-MM-DD. Existing GitHub Environment review/ref restrictions remain separate controls.

### Open the v0.2 development cycle

- Description: Starts the owner-selected next cycle at 0.2.0-dev with a release plan, pending candidate checklist and validation record.
- Relevant commit(s): Commit titled Open Neat v0.2 development cycle.
- Feature flag/default state: None / N/A.
- Migration(s): None.
- Environment/config: None; dependencies unchanged.
- User-visible: Protected Environment diagnostics show the new development version.
- Production readiness: Development-cycle setup only; no stable v0.2 candidate selected.
- Rollout notes: neat-tst/tst only. No production tag, migration, entitlement change, backfill or provider activation. Future candidate gates remain unchecked.

### Restrict shared agency CSV imports to platform administrators

- Description: Fixes Security Cloud finding `csf_17e811ce173dbbf6ac47b0e3`. Tenant users and tenant administrators can no longer invoke the global Agency CSV importer. Both the server action and write helper enforce PLATFORM_ADMIN; the upload panel follows the same role restriction. Complete CSV validation precedes a single transaction for shared Agency writes and current-organization contact writes, so invalid files and later write failures cannot leave a partial import.
- Relevant commit(s): Commit titled Restrict shared agency CSV imports for v0.2.
- Feature flag/default state: None / N/A; authorization is mandatory.
- Migration(s): None; the existing shared directory and tenant-contact schema are retained.
- Environment/config: None; version remains `0.2.0-dev`, dependencies unchanged.
- User-visible: Only platform administrators see the desktop import panel. It explains the shared-directory impact, required columns, limits, and validation/failure results. Agency browsing, search and visit actions remain available to existing authorized users.
- Production readiness: Implementation checks recorded in [0.2 validation](0.2.0-validation.md); a frozen stable candidate and production release are pending.
- Rollout notes: TST only. Use a complete agencies CSV with all 15 mapped columns (normalized spaces/punctuation are accepted), unique nonempty Agency IDs and DBA names, supported D-8 booleans, at most 500 characters per field, 1 MB per file and 2,000 agencies. Blank optional cells still clear those uploaded values. A platform administrator needs a current organization/support context for tenant contacts. This fix does not audit or repair any historical directory corruption; canonical recovery requires a separately reviewed import.

### Restrict shared wholesale-account editing to Platform Admins

- Description: Verified Codex Security finding `csf_3f897373ce028dc9a1b2c824` against current code. Both the edit page and its server action now require Platform Admin authorization before reading or updating shared canonical wholesale-account data. The account-detail Edit link follows the same role restriction. Tenant admins, ordinary users, tasters and unauthenticated callers cannot trigger account writes, licensee synchronization, assessment requests, score refreshes or cache revalidation through this action.
- Relevant commit(s): Commit titled Restrict shared wholesale edits to platform admins.
- Feature flag/default state: None / N/A; authorization applies whenever the route is available.
- Migration(s): None.
- Environment/config: None; dependencies unchanged.
- User-visible: Yes. Shared account identity/address edits are available only to Platform Admins; authorized editing retains existing validation and refresh behavior.
- Production readiness: Pending v0.2 candidate gates; focused authorization tests, typecheck and build results are recorded in the validation record.
- Rollout notes: neat-tst/tst only. No production promotion or data recovery. Existing tenant-owned notes, contacts, targeting and sales status remain available. This change does not introduce a tenant-specific canonical-field correction overlay or address separate shared-account creation/merge paths.

### Serialize password-reset issuance

- Description: Fixes the Codex Security Cloud password-reset cooldown race by locking the eligible user row before checking the rolling 60-second cooldown and creating/invalidation of reset tokens in one Read Committed transaction. Only the committed issuance sends an email. Failed or ambiguous delivery consumes the token while retaining its cooldown claim.
- Relevant commit(s): Commit titled Serialize password reset issuance per account.
- Security finding: `rf_wfr_defaf3acd0db3d93038f51e24e5a32632c38a8b7be6f7383268c45a7800dcf74:wfo_74f696accaa1a3433fb9d166af9e9c5a556e7f7187eb0dd47699147fd5ad9231:occ_0d3e55eacf8081e56661389b`.
- Feature flag/default state: None / N/A.
- Migration(s): None; uses the existing User and PasswordResetToken tables.
- Environment/config: None; existing email delivery controls remain in effect.
- User-visible: Reset requests retain the generic 202 response. Concurrent requests receive at most one reset email per account during the cooldown. After delivery failure, retry is available once the 60-second cooldown expires.
- Production readiness: TST validation recorded in [v0.2 validation](0.2.0-validation.md); future production candidate review remains pending.
- Rollout notes: neat-tst/tst only; no database migration, provider activation or production promotion.
