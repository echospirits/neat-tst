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
- Production readiness: TST fix; 18 focused hours regressions, 72 combined authorization/scheduling tests, standalone TypeScript checks and responsive previews pass. Local compilation passed but final local build checks hit shared-dependency corruption; normal hosted build verification is part of delivery evidence. Production promotion requires a separate release candidate.
- Rollout notes: neat-tst/tst only. Existing hours remain readable; no backfill or live account changes. New history begins at the first curated update and preserves the value it replaces.

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
