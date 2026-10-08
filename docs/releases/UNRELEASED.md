# Unreleased — v0.2 candidates

The v0.2 development cycle opened on 2026-10-08, immediately after the verified 0.14 production release. Normal development targets only neat-tst/tst. A future production release requires separate explicit authorization.

- TST development version: `0.2.0-dev`.
- Verified production baseline: `0.14.0`, tag `v0.14.0`, commit `574bfd0c02c4246ae2a966d86a8a1f96264b3c40`.
- TST opening base: `1d66a79ce361f2b6a3aee8f6a9f2865927682f54`; complete tree matches production `cde62a7b3470631069bd519dfd2a1c6147bee052`.
- Previous release: [archive](0.14.0.md), [user notes](0.14.0-user-notes.md), [validation](0.14.0-validation.md), [checklist](0.14.0-checklist.md).
- Current cycle: [plan](0.2.0-plan.md), [pending checklist](0.2.0-checklist.md), [validation](0.2.0-validation.md).
- Candidate: not selected; no product feature committed at opening. The owner-selected numbering is intentional; historical version records are retained.

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
