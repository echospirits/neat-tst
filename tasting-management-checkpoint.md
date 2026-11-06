# Tasting Management Phase 1 checkpoint

Owner-authorized TST-only exception, November 5, 2026, extended November 6 for unrestricted workflow status selection. Current refinement base `f6a6b3b2` (`neat-tst/tst`); original pilot base `64267a3a`. Version **0.7.2 retained**. Isolated worktree preserves unrelated local edits. No main push or release tag. Earlier validation/delivery sections below are historical receipts; [current status-selection validation](docs/releases/tasting-unrestricted-status-validation.md) tracks the new refinement.

## Implemented checkpoints

1. Additive schema, optional default-dark `TASTING_MANAGEMENT`, explicit Echo organization-ID enrollment, discrete milestones/history and optimistic versions.
2. Create/detail/admin workflow and optional feedback; real Agency/user/contact identities and administrator-only internal notes.
3. Assigned taster approval/required-comment Needs Edit and restricted mobile access.
4. Month/week calendar, grouped Workflow / Upcoming and History; Eastern dates/times and bounded search/continuation.
5. Agency Upcoming/Recent and Activity; assigned My Day/My Week without Worklist duplicates; restricted shared Agency view for tasters.
6. Canonical Log Visit context for both forms, required persisted photo, same-day assigned Visit completion and upload/reschedule review behavior.
7. Tenant-product Agency/date retail outcome, retained coverage, provenance, correction/replay and detail retry.
8. Admin CSV preview/add-only import, observed-status mapping, unmatched identity review and current source aliases/metadata.
9. Focused behavior/tenant tests, schema/typecheck/build, final full suite, scripted browser acceptance, isolated database rehearsal and shared-TST migration/readback pass. Independent visual review's sole mobile touch-target fix is resolved; final three browser rechecks pass and documenter confirms the inherited design system.
10. Operator guide, release manifest and validation record updated with published application and READY TST deployment receipts.

## Key decisions and mappings

- `TastingEvent` is schedule truth; no Past Tastings table, duplicate Visit system or synthetic Worklist tasks.
- Taster `PENDING/APPROVED/NEEDS_EDIT`; Agency `NOT_REQUESTED/REQUESTED/APPROVED/DENIED`; State `NOT_SUBMITTED/SUBMITTED/APPROVED/DENIED`; independent cancellation and Visit-backed completion remain factual evidence. A nullable manual workflow override now controls the visible label independently; without an override, an assigned draft derives as Needs Taster Response.
- Administrators in the tenant and the assigned taster may select any of the twelve workflow values, forward/backward and across terminal labels. Draft retains assignment. Needs Edit/Cancelled require reasons; denial is optional. `SET_STATUS` centralizes this policy without inventing milestone evidence, altering import provenance or manufacturing completion. Manual Completed shows Visit not logged without proof; real completed Visit/photo evidence remains immutable.
- Reassign resets taster evidence; date/time or Agency changes reset affected taster/Agency/State evidence. These material edits reset manual status for the revised proposal with history, normally clearing the override; preserved cancellation or reassignment-only denial that would re-terminalize a reopened proposal instead yields Needs Taster Response. History survives. Date/Agency changes clear prior-store/date sales; explicit Needs Edit milestone actions reset downstream current approval evidence. Canonical Visit completion clears a manual override with completion history.
- Same-store spacing defaults to 10 calendar days, exactly day 10 allowed; cancelled/denied/completed records excluded. Admin spacing override needs history reason; same-taster overlap is a hard block, including generic events. `/tastings/settings` audits changes to only the relevant organization JSON key.
- Business timezone `America/New_York`, UTC instants; ambiguous/nonexistent DST wall times rejected. No availability engine, inventory readiness, risk, predictive scheduler, route or State PDF/submission.
- Current Tastings sheet reviewed read-only; its Los Angeles timezone is ignored. Real rows not imported. Normalize ISO dates/HH:mm, remove month rows, map user ID/email, add a unique stable Row Key. Original Event_Key/approver/unmatched name/nonnumeric sales remain metadata; no fabricated historical actor/time.

## Files and migration

- `lib/tastings/*`, `app/tastings/*`, `app/api/tastings/*` own the new domain/UI/import/settings.
- Agency/home/navigation/account timeline, canonical Visit forms/actions and OHLQ annual retail workflow integrate existing paths. Generic events gain reciprocal conflict checks.
- `prisma/schema.prisma`; additive migration `20261105020000_tasting_management`; guarded migration/rehearsal scripts. No dependency upgrade/new secret or existing-row deletion.
- Focused tasting/query/action/CSV/Visit/sales/settings/integration and existing regression tests; [operator guide](docs/tasting-management.md), [UNRELEASED](docs/releases/UNRELEASED.md), [validation](docs/releases/tasting-management-validation.md).

## Validation and remaining work

This section and the earlier inline-status section record completed prior deliveries. They do not validate the unrestricted-status refinement; see its current section below.

- Schema valid; strict typecheck and optimized build pass. Bundler required the permitted sandbox escape; no hosted deployment is implied.
- Initial full run exposed one obsolete automatic-package expectation, corrected with 19 focused tests. **Final full suite: 1,105 tests / 76 suites, zero failures/skips, 37,924 ms**. Final strict typecheck/optimized build pass; mobile response-placement refinement passed 21 affected checks.
- Isolated Neon rehearsal `tasting-phase1-rehearsal`, run `630cec4a`: nine groups passed; zero existing rows deleted. Safe evidence `output/tasting-rehearsal-evidence.json`. Synthetic photo metadata only; live provider upload disabled/unverified.
- Scripted browser acceptance: **15 checks pass / zero browser errors**, `output/playwright/tastings/acceptance.json`; 390 × 844, 1440 × 900, 320px reflow, light/dark, admin workflow/editor/import/settings and taster My Week/response/restricted Agency/Visit prefill. Live Blob upload disabled/unverified; independent final screenshot review pending.
- Shared-TST migration **applied** to `neon-neat-tst`, verified host `ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech`; exact finished ledger checksum `219f048ef043e4828a8f033070837634e141272136edbd7eb5a284a28e316090` independently confirmed. Echo enabled true; other enabled tenants 0; real tasting records 0.
- Design detector ran once: new 1.3rem corrected to 1.25rem; preexisting Visit form `#7c9cff` preserved. No second detector.
- Final visual fix: mobile tasting record/navigation targets measured at least 44px; 23 affected checks and final build pass. Independent reviewer scored the fix resolved (`ship`), with no regressions. Design documentation check complete; existing sidecar drift remains unchanged.
- Application published to `neat-tst/tst`: `c01d9ba90318a7c6bba32c79881537418bb7d4f0`. Exact tree `322a5157428a9c62e520e6b4d087a313b45d4f02` equals tested local `4f3906f1`; connected GitHub delivery followed the failed local credential path. Main remote `0f027ae7d90b5eb8444ad5cfbdc93ca7c90648e9` remains unchanged; no tag.
- TST deployment `dpl_A5pd42M76258USv6QoMyVZVsqU1b` is **READY** for `c01d9ba9`, canonical `neat-tst.vercel.app` assigned, deployment/canonical health HTTP 200 with `test / neon-neat-tst / connected`. Source version 0.7.2 retained. Existing GitHub Actions filters triggered no run; none is claimed.
- Final documentation-only receipts accompany delivery. Signed-in shared-TST UI/live Blob upload and reviewed real-sheet import remain explicit acceptance/operator limits.
- Current-sheet row identity normalization/import and live photo-provider acceptance remain explicit manual/provider follow-up. Root owns final receipt updates and delivery status; do not replace pending gates with inferred success.

## November 6: main-page status editing

- Implemented inline dropdowns on Calendar, Workflow / Upcoming and History using existing guarded transitions. Required comments stay inline; terminal records and Visit-backed completion are preserved.
- 37 focused checks, completed full suite of 1,113 tests / 76 suites, strict typecheck and final optimized build pass. Five persisted browser-flow groups pass with zero browser errors at mobile/desktop sizes. Independent scoped source/screenshot review cleared the final confirmation fix. TST delivery is tracked in [inline status validation](docs/releases/tasting-inline-status-validation.md).
- Published application `e794d970312ce46f93b9b492def67bff5299d016`; exact tested tree verified. Deployment `dpl_9aC4uzwLhnfgttqf9x1Vb5WGHjRE` READY; canonical TST health HTTP 200, `test / neon-neat-tst / connected`. Main unchanged at `0f027ae7`; version 0.7.2 retained, no tag/migration/configuration change. Documentation-only receipts follow.

## November 6: unrestricted workflow status selection

- Supersedes the earlier prerequisite-based dropdown policy. All twelve workflow values are available to tenant administrators and the assigned taster on main views/detail, including Draft, manual Completed and reopening cancelled/denied/completed labels. Other users cannot change another assignment.
- The selected label is stored separately from approvals, cancellation and Visit evidence. No fabricated approval actor/time, earlier milestone, Visit or `completedAt`. Import Needs Review remains factual and nonselectable; provenance is retained. Real Visit/photo completion stays immutable. Canonical Visit completion clears the override; material revisions reset manual status with history, using Needs Taster Response when retained cancellation/reassignment-only denial would otherwise re-terminalize the reopened proposal.
- Additive migration `20261106030000_tasting_status_override`, nullable text with twelve-value CHECK; isolated rehearsal preserved all 19 existing tastings. Shared-TST application preserved both existing tastings and backfilled zero overrides; independent Neon readback confirmed the validated CHECK and checksum `7c68b05a9705a9e8a12515daa27556fa8250e017850aa4bb15841ac7e69ad2d8`. Target identity is recorded in current validation.
- Focused groups passed: 22 initial checks, 35 workflow checks and 26 query/integration/event/execution checks; scopes overlap and are not summed. Completed full suite: **1,133 tests / 76 suites**, zero failures/skips (52,885 ms). Standalone strict typecheck, final optimized build and Prisma schema validation pass. Seven persisted browser groups passed at mobile/desktop sizes with zero final browser/wire errors. The direct-detail stylesheet fix passed a final rebuild and 19 affected checks. Independent final source/visual review cleared TST. Application `1be94b2bfacd175a417cb3f6677852d11ae9c5c8` published with its exact tested tree; deployment `dpl_HevgKHg9Eq6dHaNcUUPWZoXr5UTG` READY, canonical health HTTP 200 `test / neon-neat-tst / connected`. Main unchanged at `0f027ae7`; no tag, version 0.7.2 retained. Documentation-only receipts follow. [Current validation](docs/releases/tasting-unrestricted-status-validation.md) separates this work from the completed earlier deliveries.
- Existing Neat world and shared status controls are retained. No DESIGN.md/sidecar refresh, new raster, dependency, hosted configuration, version, main or tag change.
