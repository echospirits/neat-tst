# Social Publishing pilot validation

Date: November 12, 2026. Scope: owner-authorized Social Publishing pilot in TST; no production promotion, public test posts, collaborator invitations or existing-content modification.

## Verified starting state

- Starting TST: `7cff2fdc` (`feat: simplify Supplies to a Dx5-driven status dashboard`), package `0.10.0-dev`.
- Work is isolated in branch `codex/social-publishing-pilot`; unrelated edits in the user's original checkout are preserved.
- Existing Production Supplies, Tastings and other TST-only scope remains intact. Historical production releases/tags remain unchanged.
- Read-only local configuration inventory found no supplied social Meta/LinkedIn developer applications or social OAuth tokens. Existing Google Calendar/client configuration does not establish Business Profile access. No real account discovery or publishing has been verified.

## Checks and evidence

Completed commands/results below are scoped evidence; pending checks are not passes.

| Check | Current evidence |
|---|---|
| Focused consequential domain/provider/worker tests | Focused provider/worker checks pass **29** (20 provider + 9 worker), plus domain, OAuth state, media and four migration-safety tests. These are simulated persistence/provider fixtures or script safety checks, not real access. Counts overlap the full suite and are not added to it. |
| Full completed-change test suite | Final completed-change suite: **1,430 tests / 79 suites**, zero failures/skips. |
| Strict TypeScript check / optimized build | Strict `npm run typecheck` passes. Final optimized `npm run build` passes with publishing and all other side effects disabled, including three Workflow manifests/nine steps and the final canonical-integrity, reapproval and Worklist-context fixes. |
| Prisma schema / additive migration rehearsal | Both exact social migrations rehearsed on the isolated child and then applied only to verified shared TST. Checksums below; protected row counts/unrelated migration history unchanged, constraints and Workflow dispatch column validated. Production unchanged. |
| Persisted tenant/group/approval/worker isolation | Final `scripts/social-publishing-rehearsal.ts` passed **21** groups against the real isolated PostgreSQL database, with synthetic users/destinations/media metadata and no provider requests. A later targeted unchanged-reapproval regression also passes. Details below. |
| Mobile 390 × 844 / representative desktop | Passed **15** isolated signed-in browser checks at **390 × 844** and **1440 × 1000**, zero page errors. Draft/edit/validation/pending/submitted/approved states, disabled-scheduling feedback, roles, empty/setup/results and private-media guards are covered. Exact receipt: `output/playwright/social-publishing/acceptance.json`. |
| Actual closed-browser local Workflow schedule | Passed using a fresh UI-approved synthetic revision, with local jobs enabled and live publishing disabled. Browser closed **17:20:48.113 UTC**, due **17:21:00 UTC**, result **SIMULATED at 17:21:04.015 UTC**, one attempt. No provider request. Receipt: `output/playwright/social-publishing/closed-browser-schedule.json`. Local restart was not tested. |
| Read-only real provider discovery | Blocked by dedicated social app credentials/approval and administrator consent; not attempted. |
| Live formats / scheduled public post | Await explicit authorization for exact real content/destinations. No public posts are authorized by implementation. |
| TST deployment / identity / health | Application `40982f63b81a02c18dc7affcd77336ea47f38395` is READY in **neat-tst**, deployment `dpl_4YUHAG9pH4WBBhf4uazjjo5EB4h2`. Both exact-deployment and canonical-alias health checks return `ok: true`, `database: connected`, `environment: test`, `databaseTarget: neon-neat-tst`. Production remains unchanged. |

## External setup and remaining acceptance

See [operator setup](../social-publishing.md), [current provider sources/capabilities](../social-publishing-providers.md) and [live-test runbook](../social-publishing-live-tests.md). Credential, application review and account-consent blockers do not establish unsupported publishing; they remain unverified access conditions.

Read-only Vercel CLI verification confirmed the existing team's plan is **Hobby**; minute cron would reject deployment, so it was replaced with existing Vercel Workflow for due-time execution and a daily recovery cron at 14:19 UTC. Exact Workflow dispatch/schema validation follows the completed implementation. No paid plan/configuration change is authorized. Feature access and the live server gate default closed. Simulated approval mode is immutable and cannot become live by flipping a switch.

Read-only TST environment-variable metadata inspection initially received a connector 403, then succeeded through the exact explicitly scoped Vercel CLI API fallback. No `SOCIAL_*` keys are currently configured. Existing `CRON_SECRET` and `CALENDAR_TOKEN_ENCRYPTION_KEY` are present; only names/type/target metadata were printed. No hosted secret values or application settings were changed. Dedicated social developer credentials, tester/job/live controls and private social storage/signing configuration remain owner setup.

The application has no existing public privacy-policy or Meta deletion-instructions endpoint. An owner-approved public policy, retention/deletion choices and actual contact must be published at unauthenticated HTTPS URLs before platform review. The authenticated setup guide is not a substitute. The operator guide records actual implemented storage/approval/disconnect behavior and leaves policy/legal promises to owner-approved text. It also supplies an explicit one-tenant Prisma enrollment snippet and tester-ID lookup; no enrollment was performed in this delivery.

## Isolated migration and persisted rehearsal

Created a child of the existing isolated Supplies QA branch in project `dawn-frog-33352119`, named `codex-social-publishing-20261112`, branch `br-shiny-night-avaxxd4s`. Neither shared TST, production nor the prior Supplies rehearsal was mutated. Credentials are stored only in ignored `.env.social.local`; no secret values are included in this record. The branch is retained for evidence; deletion is a separate destructive provider operation.

The guarded script requires explicit env-file/expected-host, rejects the known production/shared-TST/prior-QA hosts and permits only `development / social-rehearsal`. Migration writes additionally require the exact independently reviewed checksum. It executes only additive Social table/index/foreign-key statements, records only its own migration ledger entry and does not replay other pending migrations.

Before/after migration counts match: Organization **11**, User **36**, LoggedVisit **3**, WorklistItem **12**, SupplyOrder **47**, SupplyNeed **29**, TastingEvent **2**. The new social primary/unique/tenant foreign-key constraints are validated.

Second additive migration `20261112180000_social_workflow_dispatch` was rehearsed separately after the original schema, preserving the earlier evidence. It adds nullable `SocialDelivery.workflowRunId`; LF-normalized SHA-256 is `6a250d31328b0876254477ccad876e072b80223633f6116ff8cf7ea0739bfee8`. The selected driver confirms both exact ledger entries, the dispatch column and unchanged protected counts/unrelated migration-history fingerprint. `tests/socialPublishingMigration.test.ts` passes four meaningful target/checksum/read-only/SQL-safety tests, including production and predecessor-QA rejection.

The final 21 persisted rehearsal groups cover idempotent labels/no automatic grants; tenant/tester/group/admin guards; duplicate external destinations; contributor submission/admin approval with fixed simulation mode; immutable revision invalidation; past proposal rejection; cancellation; repeated approval race; partial retry with success preservation; ambiguity held for review and blocked from replacement by a new draft; manual Worklist creation, explicit administrator completion and return/cancel task cleanup; concurrent workers producing one delivery attempt; canceled/superseded jobs unclaimable; >15-minute late hold; changed mapping cannot redirect a revision; revoked approver enrollment; the current database live pause despite permissive environment gates; scoped workspace reads without credentials or administrative roster. A fetch trap confirms zero provider requests during worker dispatch checks.

After the final unchanged-reapproval correction, a targeted persisted regression (`--return-reapproval-only`) verifies Return → submit without editing → approve a future time creates a fresh pending revision without a unique-delivery collision, changing the earlier successful revision's approval timestamp or resending its successful destination. Its six reported checks include repeated setup gates and are **not** added to the 21-group count. Evidence: `output/social-publishing-reapproval-regression.json`.

After the final structural content-hash correction, `--canonical-worker-only` creates and approves a fresh persisted JSONB revision, then executes exactly one simulated worker attempt with zero provider requests. This confirms JSONB's object-key reordering does not invalidate the reviewed revision; media array order remains significant. Its six reported checks include repeated setup gates and are not added to the 21-group count. Evidence: `output/social-publishing-canonical-worker-regression.json`.

Private evidence files: `output/social-publishing-migration.json`, `output/social-publishing-rehearsal-results.json`; synthetic signed-in browser sessions are in ignored `output/social-publishing-qa.json`. The simulation used synthetic media metadata without a live storage upload. It does not verify Blob credentials, actual account discovery, media fetch by a provider or public posts.

## Shared TST schema delivery

Before applying, a fresh exact-target read-only preflight found both social migrations pending. Neon recovery snapshot `snap-shiny-forest-avtp6rsf` (`pre-social-publishing-pilot-20261112`) was created on the verified TST branch `br-divine-forest-avwq2b3g` at **2026-11-12 17:04:07 UTC**, expiring **2026-11-19 23:59 UTC**.

The selected driver then applied **only** the two pinned social migrations to `test / neon-neat-tst`, using the matching direct connection. Fresh read-only driver verification confirms exact finished ledger/checksums, valid constraints and the Workflow dispatch column, unchanged protected existing record counts and unchanged unrelated migration-history fingerprint. It did not run generic `migrate deploy` or reconcile historical drift.

Independent Neon readback confirms SocialGroup **0**, SocialDestination **0**, SocialPost **0**, SocialDelivery **0**, enabled `SOCIAL_PUBLISHING` tenants **0**, and Echo database live control **false**. No entitlement enrollment, initial labels, real accounts, users, live jobs, provider authorization or hosted environment settings were changed. Production was not targeted. Safe receipts: `output/social-publishing-tst-migration.json` and `output/social-publishing-tst-migration-readback.json`.

No mocked result is evidence of a live provider success. No universal exactly-once delivery guarantee is claimed. Production activation remains a separate owner decision.

## Browser and runtime acceptance limits

Browser evidence uses isolated synthetic users and destinations. No shared-TST signed-in pilot, real private Blob upload/provider media fetch, dark/enlarged-text/keyboard audit or public format is claimed. Manual completion is verified in persisted domain checks; complete native-app/manual browser acceptance remains in the live-test runbook. Approximate previews are implemented, but real Blob-backed rendering awaits private storage configuration.

The application builds Vercel Workflow durable sleeps and reloads database claims/approval/current tenant pause at execution. The local SDK uses an emulated queue; local JSON records alone are not proof that a sleeping queue survives a local process restart. Managed Vercel due-time/restart acceptance remains pending hosted tester/job configuration and the authorized scheduled-content test. The completed closed-browser local simulation is separate evidence and is never equated with public provider delivery. All local test servers were stopped after acceptance.

## TST delivery receipt

The tested application commit [40982f63](https://github.com/echospirits/neat-tst/commit/40982f63b81a02c18dc7affcd77336ea47f38395) was pushed only to `staging` / `echospirits/neat-tst:tst`. The [Vercel deployment](https://vercel.com/joe-1533s-projects/neat-tst/4YUHAG9pH4WBBhf4uazjjo5EB4h2) is READY, with the expected Git SHA and TST project `prj_fNOruLSh6BQNVXAThXYJEjBw2HYA`. Cloud build completed successfully. Authenticated protected reads of the deployment and `https://neat-tst.vercel.app/api/health` confirm the correct connected test database. No protection setting was disabled or deployment-wide secret published.

The canonical entry is `https://neat-tst.vercel.app/social`; it deliberately remains unavailable until explicit tester/tenant enrollment and configuration. No hosted `SOCIAL_*` configuration, feature enrollment, real account mapping or live activation was changed. Production/main was not pushed; its baseline is `e2a19c9b45c7bbcbccdbbbf061879a00a43b7718`. Historical release/tag refs remain intact. This following receipt commit changes only documentation and generated-review ignore rules; application code stays identical to the tested application commit.
