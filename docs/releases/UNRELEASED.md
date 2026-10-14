# Unreleased

The owner authorized wholesale import protection as an immediate patch to the current production version, 0.14.0. TST continues its separate 0.2.0-dev cycle. The existing v0.14.0 tag is unchanged; this patch is recorded separately below.

Previous release: [0.14.0 archive](0.14.0.md), [user notes](0.14.0-user-notes.md), [validation](0.14.0-validation.md), [completed checklist](0.14.0-checklist.md).

## Entry template

### Feature/change name

- Description: What changed and why.
- Relevant commit(s): Short SHA(s) from TST.
- Feature flag: Key, or None.
- Default flag state: Enabled, disabled, pilot-only, or N/A.
- Migration(s): Paths, or None.
- Environment/config: Variable names, or None; never secrets.
- User-visible: Yes or no.
- Production readiness: Ready, blocked, or not reviewed, with reason.
- Rollout notes: Required operator steps, or None.

## Pending changes

### Production 0.14.0 wholesale city corrections — 2026-10-14

- Description: Recover the existing Ohio city correction list, add the owner's mappings, normalize future Account Master accounts and reapply protected corrections to existing wholesale accounts. Corrected research failures return to the research queue regardless of their other failure reasons.
- Relevant commit(s): Commit titled Normalize Ohio wholesale cities and retry corrected research.
- Feature flag/default: None / N/A. Migration(s): None. Environment/config: None.
- User-visible: Correct city names and renewed research eligibility. Historical failure evidence and spending controls are preserved.
- Production readiness: Explicitly authorized within production 0.14.0; see [validation and rollout](0.14.0-wholesale-city-corrections.md).
- Rollout: Apply the city repair separately to verified TST and production databases with recovery evidence. TST retains 0.2.3-dev. No stable tag moved; unrelated pending development stays in TST.

### Current-version OHLQ product discovery hotfix — 2026-10-14

- Description: Separate product discovery from committed Brand Master imports and retry transient read failures without replaying writes. Sales and inventory load before discovery.
- Relevant commit(s): Commit titled Isolate OHLQ product discovery and retry transient reads.
- Feature flag/default: None / N/A. Migration(s): None. Environment/config: None.
- User-visible: More reliable scheduled data loads; persistent discovery failures remain visible in Actions.
- Production readiness: Owner-authorized same-version hotfix; validation tracked in [hotfix record](0.14.0-ohlq-discovery-hotfix.md).
- Rollout: Production remains 0.14.0; TST remains 0.2.3-dev. Existing stable tag unchanged.

None.

## Current-version patch — 2026-10-10

### Wholesale names and manual address corrections survive imports

- Description: Preserve existing wholesale names regardless of active status; retain manual street address, city and ZIP corrections independently, including deliberate clearing and existing differences from stored OHLQ records.
- Relevant commit(s): Selective production adaptation of TST `52dff23d0eefb6d5198eadf676b50264e58744a9`, based on production `574bfd0c02c4246ae2a966d86a8a1f96264b3c40`.
- Feature flag: None; existing entitlements unchanged.
- Default flag state: N/A; applies to wholesale import/edit/merge paths.
- Migration(s): `prisma/migrations/20261010160000_wholesale_address_import_protection/migration.sql`.
- Environment/config: None. Verify the existing production target before the additive migration; no broad migrate deploy.
- User-visible: Yes; protected edits stay saved and the edit form explains persistence.
- Production readiness: 623/623 tests, clean types, optimized build, responsive previews and production-data migration rehearsal passed. Exact live deployment and migration evidence is recorded after push in the linked delivery receipt.
- Rollout notes: Owner explicitly requested current live versions, overriding the normal hotfix increment. Production stays 0.14.0 and TST stays 0.2.0-dev. Production migration applied and registered at 2026-10-11 01:43:09.784 UTC: 109 address, 109 city and 97 ZIP flags, zero consistency mismatches, every existing value unchanged. Keep flags on application rollback and pause the old importer until protection is restored.
- Validation: [Current-version production patch](0.14.0-wholesale-import-protection-validation.md); [live delivery receipt](https://github.com/echospirits/neat-tst/blob/tst/docs/releases/0.2.0-wholesale-import-protection-validation.md#current-version-production-delivery).
