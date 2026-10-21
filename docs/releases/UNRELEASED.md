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

## TST operational repair: Echo Spirits inventory credentials (2026-10-21)

- Scope: TST only, organization org_echo_spirits, database target neon-neat-tst. Version remains 0.2.3; no application, migration, flag, or production change.
- Oct 20 run 39450882806 and Oct 21 run 39630789234 completed shared reports but OHLQ rejected the tenant inventory login. Shared reports use the GitHub Environment OPS secrets; inventory uses separately encrypted organization credentials.
- Used the existing explicit repairTenantCredentials workflow option with deploymentEnvironment=test to refresh only this tenant from the working TST secrets. No credentials were read into local files or logs.
- Repair step succeeded in [run 39637440812](https://github.com/echospirits/neat-tst/actions/runs/39637440812); the two-day reload is still running. Inventory authentication and full-load completion remain unverified at documentation time.
- Earlier failures (for example Oct 18 run 39137135917) were missing lockfile entries, fixed Oct 19. A green scheduled run can mean every import step was skipped: verify individual steps before claiming recovery.
- On future OHLQ password changes, update the appropriate tenant organization settings as well as shared-report secrets; never copy a shared login to another tenant automatically.

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
