# Unreleased — 0.14.0 candidates

The 0.14.0 development cycle opened on 2026-09-29. This manifest records work in Neat TST that may be included in 0.14.0. Production promotion is a separate, explicitly authorized release task.

- TST development version: `0.14.0-dev`.
- Verified production baseline: `0.13.0`, tag `v0.13.0`, commit `3703a1b8f77065c0105005e6a4ad63d2619fe4e8`.
- TST opening base: `94fe624b7ab14d0cfdf4e4367c7b8d8c9ff35e70`; its complete Git tree matches the production baseline.
- Previous release: [0.13.0 archive](0.13.0.md), [validation](0.13.0-validation.md), and [completed checklist](0.13.0-checklist.md).
- Current cycle: [release plan](0.14.0-plan.md), [pending release checklist](0.14.0-checklist.md), and [validation record](0.14.0-validation.md).
- Release candidate: not selected. No product features are committed to this release at cycle opening.

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

## Pending changes

### Open the 0.14.0 development cycle

- Description: Advances the canonical application and lockfile versions to `0.14.0-dev`; starts the manifest, release plan, pending checklist, and validation record for eventual 0.14.0 promotion.
- Relevant commit(s): The TST commit titled `Open Neat 0.14.0 development cycle`; subsequent verification evidence is linked above.
- Feature flag: None.
- Default flag state: N/A.
- Migration(s): None.
- Environment/config: None.
- User-visible: Yes; protected Environment diagnostics show the development version.
- Production readiness: Not reviewed for production; development cycle setup only. Candidate-specific release checks remain pending.
- Rollout notes: Deploy only to `neat-tst/tst`. No schema changes, backfills, entitlement changes, or external service activation. Remove `-dev` only when preparing the exact stable release candidate, then complete the linked checklist.
