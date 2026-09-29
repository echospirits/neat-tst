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
- Relevant commit(s): `9cfce468` (`Open Neat 0.14.0 development cycle`); subsequent verification evidence is linked above.
- Feature flag: None.
- Default flag state: N/A.
- Migration(s): None.
- Environment/config: None.
- User-visible: Yes; protected Environment diagnostics show the development version.
- Production readiness: Not reviewed for production; development cycle setup only. Candidate-specific release checks remain pending.
- Rollout notes: Deploy only to `neat-tst/tst`. No schema changes, backfills, entitlement changes, or external service activation. Remove `-dev` only when preparing the exact stable release candidate, then complete the linked checklist.

### Self-service password reset

- Description: Adds a `Forgot password?` action to sign in. Active users with a password can receive a one-time reset link that expires after one hour, set a new password, and revoke existing sessions. Responses do not disclose whether the email belongs to an account.
- Relevant commit(s): `d5a43589` (self-service password reset).
- Feature flag: None.
- Default flag state: Available to all users.
- Migration(s): `prisma/migrations/20260923123000_password_reset_tokens`.
- Environment/config: Uses the existing email configuration and delivery safeguards; no new variables.
- User-visible: Yes.
- Production readiness: Not reviewed; automated tests deferred for TST review. Production release remains separate.
- Rollout notes: The additive migration was applied to the isolated TST Neon project `neat-crm-tst` (`neondb`, primary branch `main`), reported by the app as `neon-neat-tst`. TST email is suppressed by default; sending from TST requires `EMAIL_SEND_ENABLED=true`, an `EMAIL_OVERRIDE_RECIPIENT`, and the existing Resend configuration. Expired reset records can be retained safely; token hashes are stored instead of raw tokens.
