# Echo-only final audit and future production scope

Audit date: October 28, 2026. Owner authorized the final TST access audit and production comparison, then selected **Include Forecasting in future release**. This authorizes the release scope, not production execution during this audit.

## Audited refs and release contents

| Item | Verified state |
| --- | --- |
| Current production | `origin/main` `e05e4e86bd5816c420462319c36b638bfc97571e`, tree `08f18b2d96bcc4c32aeb154b43d6ae8d9061516f` |
| Audited TST application | `staging/tst` `c4346aedaf1213677cf9b89208878dd0c22bffc8`, tree `44406081aa1185bf2166ded63c1294a87b461d05` |
| Version | Both 0.2.3; no new version or production tag |
| Direct tree comparison | 198 changed paths at these refs; history diverges by 168 production-only and 286 TST-only commits |
| Earlier TST Forecasting work | 53 paths differ from production at pre-transition TST `9ad65455e7d1e28a2c5060d55d9dd903ee626db0` |
| Echo-only transition | 169 paths differ between that pre-transition ref and the audited TST application; some paths overlap the Forecasting work |
| Additional audit-only changes | Release-check helper regression fix, its tests and this documentation; application routes/layout/domain behavior are unchanged in this audit |

The release includes the Echo-only login/session/invitation/reset boundary, Echo administration and worker selection, retired customer console/Support View, retired Support/Recipes, and the Forecasting pilot plus scheduled sources, historical reconciliation and eligible-product filtering. The actual refs and UNRELEASED manifest govern a future release. The previously shipped OHLQ recovery fixes are already on current main.

The old release helper selected the numerically highest ancestor tag (`v0.14.0`) even though current production is 0.2.3. It incorrectly called already-shipped Communications/schema work new. The helper now compares the exact production SHA/tree and labels divergent commit history as context. At the audited application refs it reports one added feature key, `PRODUCTION_FORECASTING`, and one new migration. `OHLQ_PRODUCTION_SOURCES_STATUS` is a workflow-generated artifact-summary name, not a new secret to provision. Existing source/cron settings still need review.

## Access and surface findings

- Inventory: 81 source page/API entry points. All 69 eligible anonymous GET probes passed, with no session/cron secret or mutation supplied. Four expected public entries are login, invitation acceptance, password setup/reset and minimal health. Protected surfaces require authentication or redirect to sign-in. Six cron routes deny anonymous requests.
- Two initially unexpected responses were existing redirect aliases: `/my-week` streams a redirect to the protected schedule, and the manual-import GET redirects to protected Data Status without running an import. Follow-up requests confirmed sign-in at both targets. POST/PUT/PATCH/DELETE and logout were not exercised in this sweep; their behavioral/authorization coverage remains in the fixture suite.
- Echo membership is checked independently of email domain and role. Existing fixture tests execute real login/session/reset/invitation/organization resolution and reject old outside cookies, changed membership, forged scope and foreign maintenance/worker targets. Remaining PLATFORM_ADMIN literals are compatibility/admin classification or additional private-owner/assignee restrictions; they no longer supply global customer context. No broad role replacement was made.
- Retired Support, Recipes, public recipe sheets, provisioning and Support View routes are absent from source/build and were live-probed in increment 4. Passive legacy data/FK/merge handling remains. Existing database records, blobs and historical deployment artifacts were not erased or globally revoked by removing application routes.
- Existing Calendar and mailbox OAuth callbacks require current user/CRM authorization plus state/provider identity. SMS callbacks require the signed Echo connection. Visit-upload client-token generation requires a current session, bounded upload token/path and existing environment gate; provider completion remains SDK-validated with a no-op application completion handler. Existing public Blob asset URLs/storage semantics are unchanged, not a new private-asset guarantee.
- Old pre-transition and current immutable TST deployment URLs returned 302 to `vercel.com` without credentials. TST and production project metadata both show enabled Vercel SSO protection for `all_except_custom_domains`. Stable application domains intentionally rely on application authentication; historical immutable builds are not publicly bypassing the new login boundary in this check.
- This is an application access/rollout audit, not a live OAuth/calendar round trip or complete security certification. No temporary shared-TST administrator session was created.

## Database comparison and retained outside data

Only read-only metadata/count queries were run after separately verifying the production and TST project/branch/database identities. The detailed identities and customer activity counts are retained in the ignored local audit receipt, because this repository is public. No credentials, stored token fields, correspondence, ticket bodies or recipe contents were selected.

- Production has 102 public tables and TST 107. All 102 shared tables have identical column-name/type/nullability signatures. The five TST-only tables are ProductionSourceImport, ProductionDemandObservation, ProductionGuidanceObservation, ProductionForecastRun and ProductionForecastSnapshot. This is a column comparison, not a claim that every historical index/constraint or ledger entry is identical.
- The sole new migration relative to main is `20261028010000_production_forecasting`. Its canonical Git/LF SHA-256 is `013f61facef70ec93e99a03f69952340b57083e8ecf90a2c712d88600e921f70`, matching TST's completed ledger row. It is absent from production, whose Forecasting tables are also absent. Hashing the Windows CRLF checkout gives a different byte checksum; execute the canonical committed bytes.
- Historical ledgers contain 27 completed production rows and 47 completed TST rows. There are 16 shared-name raw checksum differences, 21 TST-only names (including Forecasting) and one production-only password-reset name. Every recorded checksum matches the current source in LF or CRLF form: production 22 LF/5 CRLF, TST 27 LF/20 CRLF. These historical gaps/line-ending differences are not instructions to replay old DDL. No ledger row was rewritten. Follow the controlled migration method in the [0.2.3 runbook](0.2.3-migrations.md); do not run blanket migrate deploy, reset or db push.
- Outside organizations retain historical accounts and authored work. Recent activity and provider-connection counts were checked separately; bounded counts are not proof that no earlier use occurred. Customer-specific metrics remain in the local receipt. No outside row is reassigned or deleted, and no notice/export/email was sent.
- Preserve existing Echo calendar identities/tokens and their lifecycle during cutover. Provider-connection inventory was recorded locally. No live provider connection was used or disconnected.

## Concrete future cutover steps

These steps require a separately authorized production release against a freshly verified exact candidate. They were not executed here.

1. Freeze the chosen tested TST tree/version and compare it again with current main. Promote that tree in a single-parent commit from current main, preserving intervening main fixes; do not merge divergent TST history wholesale. Recheck the production project `ohlq-field-crm` and dedicated TST target separately.
2. Establish the release recovery point and recheck schema/ledger identities. Apply only the reviewed Forecasting migration, using its canonical checksum and guarded transaction/ledger registration. Do not replay historical TST-only migration names. Preserve all outside and retired-module records/tables.
3. Plan Forecasting activation explicitly. The migration inserts the pilot enabled for Echo and disabled for others, preserving existing rows on replay. Production source configuration and feature state were checked separately in the local receipt. Configure the approved Ohio history start/direct-invoice policy before the new scheduled source job can run; TST's accepted settings are `historyStart=2019-01-01`, `directInvoices=invoice-date`. First source/history initialization is a separate controlled data operation; empty new production tables do not contain TST's historical observations automatically. No TST private data or credentials are copied by the release.
4. Normalize the existing production owner account from PLATFORM_ADMIN to ordinary ADMIN while keeping its existing active Echo membership, password and history. The existing owner role and lack of another ordinary Echo administrator were checked privately; retained platform-role assignment/private-workflow restrictions make this a functional cutover requirement. Do not create a duplicate owner, move another organization, or reset a password. Verify owner access after normalization; the TST owner account is already an ordinary Echo ADMIN.
5. Verify production READY, environment/database health, Echo sign-in, outside denial, maintenance/Users access, own task assignment, retired paths, forecast entitlement/source readiness and existing calendar ownership. Keep credentials/provider activation gates and failures visible. A successful build is not evidence of live provider completion.
6. Keep outside data retained. Any customer notice, export, provider teardown, table deletion or broader role/schema cleanup is a separate owner-directed operation. Archive the exact release and delivery receipts only after the authorized cutover succeeds.

Production main, database rows/schema/ledger, account roles, entitlements, credentials, schedules and provider connections were unchanged by this audit. TST publication of the helper fix/documentation is recorded in the delivery receipt.

## Validation and delivery boundary

All **910 tests / 76 suites** passed with zero failures, skips or cancellations, including two new disposable-Git helper regression cases. Typecheck and whitespace checks passed. A fresh, isolated Node 22.23.4/npm 10.9.9 install of the exact committed package/lock files installed 640 packages successfully using `npm ci --offline --ignore-scripts --no-audit --no-fund`. The first online attempt timed out during extraction after four minutes; the fresh offline retry completed in five minutes. Lifecycle scripts were deliberately disabled for this lockfile check; the root dependency directory and package/lock files were not changed.

Application, schema, dependencies and workflows are unchanged from the audited TST application. Optimized-build and 390x844/1440x900 responsive evidence is inherited from increment 4; the new TST publication also receives a Vercel build, with its exact commit/tree, READY status and environment/database health recorded in the local delivery receipt. The 69 anonymous GET results are a bounded access check, not an authenticated provider round trip.
