# Tasting Management Phase 1 validation

November 5, 2026. Owner-authorized feature development for `neat-tst/tst`, based on `64267a3a`, with package version **0.7.2 retained**. No production/main promotion or release tag is authorized. This record distinguishes source/fixture checks from real providers and shared-TST delivery.

## Scope and current result

The implementation covers the [operator guide](../tasting-management.md): tenant-private tasting milestones/history, gated calendar/workflow/history, taster response, Agency/My Schedule integration, same-day photo-backed Visit completion, coverage-aware retail outcome, spacing/conflicts, settings and reviewed CSV import. The existing generic EventShift workflow remains separate, with reciprocal taster-conflict checks. Future inventory/risk/smart-scheduling/route/State-PDF work is excluded.

| Gate | Evidence/status |
| --- | --- |
| Targeted source audit and implementation map | Complete; [checkpoint](../../tasting-management-checkpoint.md) |
| Schema validation and generated client | Passed against the additive tasting schema |
| Final strict TypeScript check | Passed |
| Optimized build | Passed; sandbox restrictions required running the bundler outside its restricted sandbox. This is build evidence, not hosted activation |
| Initial full suite | 1,102 tests: 1,101 passed, one obsolete package expectation failed because it assumed all features belonged to the automatic TST package |
| Corrected pilot/package expectation | Corrected to preserve explicit pilot enrollment; 19 focused tests passed afterward |
| Final full suite | **1,105 tests / 76 suites passed; zero failures/skips**, 37,924 ms |
| Affected rerun after small mobile response-placement refinement | **21 passed**, `tastingActions`, `tastingQueries`, `tastingIntegrations` and `tastingVisitAction` |
| Isolated real-database rehearsal | Nine check groups passed; details below |
| Scripted taster mobile/admin desktop browser acceptance | **15 checks passed, zero browser errors**, synthetic fixtures; final mobile target recheck **3 passed**, including route protection |
| Independent visual finish review | Initial review requested 44px mobile record/navigation targets; reviewer scored the fix **resolved**, no regressions, `disposition: ship` for the scored fix. Existing design system preservation independently checked |
| Live object-storage upload | **Not verified**; local browser/rehearsal provider uploads are disabled |
| Current spreadsheet import | Structure/sample review only; real rows **not imported** |
| Shared-TST migration and entitlement readback | **Applied and independently verified**; exact checksum/target below; Echo enabled, other enabled tenants zero, real tastings zero |
| Tested commit/push to `neat-tst/tst` | **Published and remotely verified** as `c01d9ba90318a7c6bba32c79881537418bb7d4f0`; exact tested tree below |
| TST deployment/environment/database health | **READY** application `c01d9ba9`, deployment `dpl_A5pd42M76258USv6QoMyVZVsqU1b`; deployment/canonical health HTTP 200, `test / neon-neat-tst / connected`; source version 0.7.2 retained |
| Production/main/tag changes | Excluded; main remote `0f027ae7d90b5eb8444ad5cfbdc93ca7c90648e9` verified unchanged by this task |

## Isolated database rehearsal

`scripts/tasting-management-rehearsal.ts` ran against the explicitly guarded isolated Neon target `tasting-phase1-rehearsal`. Sanitized evidence is retained in ignored `output/tasting-rehearsal-evidence.json`, run `630cec4a`. Existing rows deleted: **0**. The separate browser fixture setup file contains temporary session material and is not a shareable validation artifact.

The nine passing groups exercised persisted draft creation; taster/Agency/State milestones and exact approved assignment; reschedule invalidation with retained history; blocked spacing/reasoned admin override; concurrent overlap serialization; composite tenant foreign keys and foreign edit rejection; observed spreadsheet status/unmatched-name/add-only import replay; same-day canonical Visit/photo completion and replay; and owned/represented product sales with missing coverage, idempotency and correction.

Photo evidence in this database rehearsal uses **synthetic persisted image metadata**. It proves database/service evidence rules, not live object upload, download or provider availability. Browser fixtures are synthetic and isolated from shared TST/production records.

## Focused coverage

The tasting workflow, settings, execution, Visit caller, sales, query, action, CSV and integration suites cover:

- Milestone prerequisites, terminal behavior, required edit/cancellation comments, no-op history and optimistic concurrency.
- Reassignment/date/Agency invalidation, day-10 boundary, ignored terminal conflicts, reasoned spacing override and hard overlapping taster/EventShift rejection.
- Server actor/organization boundaries, forced assigned-taster scope, feature-dark paths, private note/import/history redaction and restricted Agency reads.
- Canonical Visit prefill, same-day assigned ownership, required persisted photo, linked completion and upload/reschedule review behavior.
- Exact Agency/date/represented-product sales, retained coverage, unknown versus zero, correction/replay and source provenance.
- CSV aliases/quoting/BOM/bounds, ambiguous header rejection, observed milestone mapping, unmatched user review and add-only import identity.

The final `npm test` run passed **1,105 tests / 76 suites**, with zero failures/skips and duration **37,924 ms**. Final strict typecheck and optimized build passed. A subsequent focused validation of the small mobile response-placement refinement passed **21 affected tests** across `tastingActions`, `tastingQueries`, `tastingIntegrations` and `tastingVisitAction`. Routine documentation-only receipt updates do not require another build/typecheck.

## Browser and visual evidence

The scripted browser receipt is ignored `output/playwright/tastings/acceptance.json`: **15 passed checks, zero browser errors**, using synthetic isolated fixtures. Coverage includes 390 × 844 and 1440 × 900, 320px reflow, light/dark themes, administrator calendar/editor/spacing error with retained fields, current-header CSV preview/unmatched identity, settings, assigned taster My Week, approval and required-comment Needs Edit, private-note redaction, restricted Agency information and Log Tasting Visit prefill with one photo input. The script also verifies unauthenticated route protection, empty search and mobile calendar reflow.

Live Blob upload is disabled and **not verified**. Scripted browser acceptance does not establish live object upload or full accessibility conformance. Independent review inspected all 12 required captures and identified one material fix: enlarge mobile record and tasting-navigation hit areas. The final built recaptures of My Schedule and Agency, plus measured 44px targets, resolved that fix without observed regressions. The reviewer returned `disposition: ship` for the scored fix. The final affected account/navigation/integration checks passed **23 tests** and the rebuilt app passed. The separate touch-target receipt is `output/playwright/tastings/review-touch-targets.json` (three checks, zero browser errors).

The independent documenter confirmed this is an extension of the established Neat palette, typography, components and compact record treatment. `DESIGN.md` and its sidecar were preserved; their preexisting sidecar staleness was not repaired or promoted into a new system decision.

The mechanical design detector ran once. Its two advisories were addressed or scoped: the new 1.3rem type size was corrected to 1.25rem; preexisting `LogVisitForm` color `#7c9cff` was preserved outside this change. No second detector run was performed.

## Shared-TST migration and independent readback

- Applied migration: `20261105020000_tasting_management`.
- Reviewed/applied SHA-256: `219f048ef043e4828a8f033070837634e141272136edbd7eb5a284a28e316090`.
- Explicit target: **`neon-neat-tst`**; verified host `ep-noisy-dew-avchokwr-pooler.c-11.us-east-1.aws.neon.tech`.
- Independent owning-source Neon readback confirms the same finished migration ledger checksum, Echo `TASTING_MANAGEMENT` enabled **true**, other enabled tenants **0**, and real tasting records **0**.
- No real spreadsheet schedule was imported. Synthetic browser/rehearsal records remain on the separate isolated rehearsal branch.
- TST application `c01d9ba90318a7c6bba32c79881537418bb7d4f0` is remotely verified. Main remote `0f027ae7d90b5eb8444ad5cfbdc93ca7c90648e9` is unchanged by this task.

## Spreadsheet source and remaining mapping

The [Current Tastings sheet](https://docs.google.com/spreadsheets/d/1cPo7iHZX4l1IdiGEywBPp-zb9y7rYVmJiXZb01E0-ys/edit#gid=460678997) was inspected read-only through metadata and bounded current rows. Its `America/Los_Angeles` timezone is not adopted. Dates/times must be normalized explicitly to ISO date/24-hour Eastern time, month separators removed, actual users mapped by reviewed ID/email, and a stable unique Row Key prepared. Original approvers and non-unique `Event_Key` remain metadata; no historical actor/time is fabricated. Nonnumeric sales text remains unknown sales evidence. No real source import was performed.

## Final TST receipts

- Published application: `c01d9ba90318a7c6bba32c79881537418bb7d4f0`; exact tree `322a5157428a9c62e520e6b4d087a313b45d4f02`.
- Local tested source: `4f3906f1e7449c359ffec2f93bbe24f65af40141`, with that identical tree. Local Git Credential Manager could not authenticate and the noninteractive retry failed promptly. The connected GitHub tools published the unchanged tree with parent `64267a3a`, then updated only `neat-tst/tst` using an expected-head lease. Git fetch and tree comparison independently verified exact content equality; no force update or main/tag change was made.
- Final full-suite result: **1,105 tests / 76 suites, all passed**, zero failures/skips, 37,924 ms.
- Final strict typecheck/optimized build: **Passed**; affected response-placement checks: **21 passed**, final account/navigation/mobile-target checks: **23 passed**.
- Browser scripted receipt: **15 passed / zero browser errors**, `output/playwright/tastings/acceptance.json`; final mobile target recheck **3 passed**. Independent screenshot review's sole fix is resolved; `disposition: ship` covers the scored fix. Design documentation check complete.
- Reviewed migration checksum/verified target/entitlement readback: **Applied and independently verified**, as recorded above.
- Recovery: the migration is additive and transactional; previous application code remains compatible. No database restore or destructive rollback was performed or is part of this task.
- Published `neat-tst/tst` application SHA and remote identity: **Verified**, as above.
- Application deployment **`dpl_A5pd42M76258USv6QoMyVZVsqU1b`** is **READY** with Git metadata `echospirits/neat-tst`, branch `tst`, exact SHA `c01d9ba90318a7c6bba32c79881537418bb7d4f0`. Vercel's Production target here is the dedicated **neat-tst project**, not Neat's production project.
- [TST](https://neat-tst.vercel.app) and [deployment](https://neat-es803r140-joe-1533s-projects.vercel.app) health each returned HTTP 200, `ok=true`, `environment=test`, `databaseTarget=neon-neat-tst`, `database=connected`, at approximately **5:31 PM Eastern on November 5**. The canonical TST alias is assigned to this deployment. Source version remains 0.7.2; a rendered signed-in hosted version label was not observed.
- Hosted Vercel logs record a successful build and deployment. The public GitHub Actions query for this exact SHA returned zero runs: existing push path/branch filters exclude this change. No GitHub Actions pass is claimed and no workflows were changed or manually triggered.
- Canonical `/login` returned HTTP 200 with sign-in content; unauthenticated `/tastings` returned Next.js's HTTP-200 streamed redirect to `/login`. This verifies the observed login boundary, not a signed-in hosted workflow. No rendered version label was visible on the public login page.
- Signed-in **shared-TST** UI and live object-storage upload remain unverified. Authenticated taster/coordinator browser acceptance above uses legitimate synthetic sessions solely on the isolated rehearsal branch. No shared-TST session or real tasting record was manufactured.
- Remaining operator work: reviewed current-sheet identity/date/time/row-key normalization and import, plus live photo-provider acceptance. No production promotion is included.
