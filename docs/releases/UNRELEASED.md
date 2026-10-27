# Unreleased

No pending changes. Neat **0.2.3** was released on 2026-10-19. [Archived technical release](0.2.3.md) | [Tenant announcement](0.2.3-user-notes.md) | [Production receipt](0.2.3/production-rollout.json).

Development remains frozen by owner instruction. Do not start a new version or feature cycle until the owner explicitly opens it. Package version remains 0.2.3.

## Same-version production hotfix: OHLQ dependency installation (2026-10-19)

- Repair the Workflow optional peer lock entries for chokidar 5.0.0 and readdirp 5.1.1. Production run 39289943922 failed at npm ci before any import; the earlier run 39282816365 succeeded.
- Preserve version 0.2.3 under the owner-authorized same-version production hotfix scope. No application logic, schema, credentials, flags, or dependency version upgrades.
- Require the exact-candidate Node 22/npm 10 dependency check before future promotions; today's check 39285632962 had failed despite the application deployment succeeding.
- Validation and deployment evidence: [Hotfix notes](0.2.3-ohlq-lockfile-hotfix.md).

## Same-version production hotfix: OHLQ connectivity and inventory status (2026-10-21)

- Recover transient database failures for fixed-value report-status upserts and inventory readiness reads with bounded retries. Imports and intelligence writes are never replayed by this retry helper.
- Preserve COMPLETED inventory status when follow-up intelligence fails; report that failure separately and continue other tenants. Sales startup failures now reach error-status handling.
- Version remains 0.2.3. No migration, credentials, flags, dependency, or UI changes.
- Evidence: [Hotfix notes](0.2.3-ohlq-connectivity-hotfix.md).

## Same-version production hotfix: independent OHLQ report steps (2026-10-27)

- Production runs 40500292563 and 40500295861 stopped because the newest upstream Account Master was dated October 26, not October 27. This is an upstream publication delay; retain the freshness guard and its visible failure.
- Permit Brand Master and sales imports to run after a master-report failure, allowing inventory and post-sales processing to continue. Require successful setup/secrets validation, no failed explicit credential repair, an active schedule slot, and no cancellation. Do not hide failures with continue-on-error or import stale master data.
- Version remains 0.2.3. Workflow-only behavior change; no application, dependency, database, or credential changes.
- Validation: focused workflow isolation/security/privacy tests and git diff --check. Live recovery verification follows publication.

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
