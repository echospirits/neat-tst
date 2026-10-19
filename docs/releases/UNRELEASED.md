# Unreleased

No pending changes. Neat **0.2.3** was released on 2026-10-19. [Archived technical release](0.2.3.md) | [Tenant announcement](0.2.3-user-notes.md) | [Production receipt](0.2.3/production-rollout.json).

Development remains frozen by owner instruction. Do not start a new version or feature cycle until the owner explicitly opens it. Package version remains 0.2.3.

## Same-version production hotfix: OHLQ dependency installation (2026-10-19)

- Repair the Workflow optional peer lock entries for chokidar 5.0.0 and readdirp 5.1.1. Production run 39289943922 failed at npm ci before any import; the earlier run 39282816365 succeeded.
- Preserve version 0.2.3 under the owner-authorized same-version production hotfix scope. No application logic, schema, credentials, flags, or dependency version upgrades.
- Require the exact-candidate Node 22/npm 10 dependency check before future promotions; today's check 39285632962 had failed despite the application deployment succeeding.
- Validation and deployment evidence: [Hotfix notes](0.2.3-ohlq-lockfile-hotfix.md).

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

None.
