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
