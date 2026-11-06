# Unrestricted tasting workflow status selection

November 6, 2026. Owner-authorized TST-only refinement on base `f6a6b3b2`. Version **0.7.2 retained**; no production/main promotion or release tag. This record supersedes the prerequisite-based dropdown policy in [earlier inline-status validation](tasting-inline-status-validation.md), which remains an unchanged historical receipt.

## Current behavior

- Administrators can select any of the twelve workflow values for a tasting in their organization; the currently assigned taster can do the same for their own assignment. Selection is allowed at any time, forward or backward, including reopening Cancelled, denied or Completed labels. Draft retains the assignment. Other users cannot select statuses for another taster.
- Calendar, Workflow / Upcoming, History and detail reuse the existing inline status control. Ordinary choices save on selection; Taster Needs Edit and Cancelled require reasons, and denial reasons remain optional. URL/filter/scroll context, saving feedback, duplicate-submit protection and error retention remain part of acceptance.
- `SET_STATUS` writes nullable `workflowStatusOverride` and audited prior/new values. Its centralized server policy retains organization, entitlement, active-user, assignment and optimistic-version checks. Future taster restrictions belong in this branch.
- The workflow label is independent of milestone/Visit facts. Later labels do not fabricate earlier approvals, actors or timestamps. Manual Completed creates no Visit, photo, `completedAt` or `completedVisitId`; without qualifying evidence it shows **Visit not logged**. Real Visit/photo evidence remains linked and immutable even when the label changes.
- Canonical same-day assigned Visit/photo completion clears a manual override and retains its previous value in completion history. Material Agency, assignment or date/time edits reset manual status for the revised proposal with history and retain existing approval-reset rules. They normally clear the override; preserved cancellation or reassignment-only denial evidence that would re-terminalize a reopened proposal instead yields Needs Taster Response. Regression cases cover both paths while retaining the evidence. Real Visit-backed completion still prevents schedule rewriting.
- Import Needs Review remains a factual nonselectable flag. Manual status selection does not alter import identities, metadata or provenance. Current sales observations remain source-qualified.

## Migration evidence

- Additive migration: `prisma/migrations/20261106030000_tasting_status_override/migration.sql`.
- Adds only nullable text `TastingEvent.workflowStatusOverride` and a CHECK allowing `DRAFT`, `NEEDS_TASTER_RESPONSE`, `TASTER_APPROVED`, `TASTER_NEEDS_EDIT`, `REQUESTED_AGENCY_APPROVAL`, `AGENCY_APPROVED`, `AGENCY_DENIED`, `SUBMITTED_TO_STATE`, `STATE_APPROVED`, `STATE_DENIED`, `CANCELLED` and `COMPLETED`.
- Reviewed SHA-256: `7c68b05a9705a9e8a12515daa27556fa8250e017850aa4bb15841ac7e69ad2d8`.
- Isolated rehearsal: **applied; all 19 existing tastings preserved**. No label backfill, milestone rewrite, record deletion or fabricated completion.
- Shared `neon-neat-tst` migration: **applied; both existing tastings preserved, zero overrides backfilled**. Independent Neon readback confirmed the same checksum and CHECK validation (`convalidated: true`).
- Verified dedicated test target: project `dawn-frog-33352119`, branch `br-divine-forest-avwq2b3g`, endpoint `ep-noisy-dew-avchokwr`, database `neondb`. Production is excluded; branch naming does not change this verified test-project identity.

## Validation and delivery

| Check | Current evidence |
| --- | --- |
| Initial focused checks | 22 passed |
| Workflow checks, including revised reopened-proposal regression cases | 35 passed |
| Query/integration/event/execution checks | 26 passed |
| Completed full suite | 1,133 tests / 76 suites passed; zero failures/skips, 52,885 ms |
| Standalone strict typecheck | Passed |
| Final optimized build, including TypeScript validation | Passed after the direct-detail stylesheet fix; 19 affected checks also passed |
| Prisma schema validation | Passed with an inert nonnetwork URL; initial attempt lacked the required environment variable |
| Persisted browser flows; 390 × 844 mobile and 1440 × 900 desktop | Seven groups passed across the persisted initial run and bounded continuation; zero final browser/wire errors |
| Final scoped source/visual review | Clear for TST; independent review scored the direct-detail control fix resolved across the final 12 captures, with no remaining material finding |
| Shared-TST migration and independent readback | Applied; 2 existing tastings preserved, 0 overrides backfilled; checksum and validated CHECK confirmed |
| Tested application commit/tree and TST push | Published `1be94b2bfacd175a417cb3f6677852d11ae9c5c8` on `neat-tst/tst`; tree `8e85d82db1e2e55fdfafb0e8e09ebe698ec61fd8` exactly equals tested local `1fe364df957193574569fd8ff675f0b55963ceda` |
| READY deployment and canonical test/database health | `dpl_HevgKHg9Eq6dHaNcUUPWZoXr5UTG` READY for the exact application SHA; canonical health HTTP 200, `test / neon-neat-tst / connected`; GitHub Vercel status success |

Focused groups overlap and are not summed; the completed full suite consolidates the scope. Completed browser acceptance includes all forward/backward workflow choices for an administrator and assigned taster, terminal-label reopening, assignment retention on Draft, required/optional reasons, stale/rejected-save recovery, unauthorized assignment/tenant protection, retained milestone/import/Visit facts, manual Completed without proof, canonical Visit clearing an override and revised-proposal status resets. Tests from the prior inline-status delivery are not evidence that these changed semantics pass.

Browser evidence: `output/playwright/tasting-unrestricted/acceptance.json` records the initial four passed groups and the same-fixture continuation for groups five through seven. The first runner attempt missed the optional-denial Save action; its helper was corrected. The next pass found that detail deep links lacked the shared control stylesheet. The control now imports it directly; final rebuild, 19 affected checks, fresh-browser direct-detail 44px checks and remaining flows passed. Twelve screenshots cover list, History, manual completion, detail, failed/stale saves, calendar and light/dark mobile. No new behavior change followed the full suite.

The extension preserves the established Neat world and shared typography, tokens and components. Existing DESIGN.md and the pre-existing sidecar remain unchanged; no new shipping raster is introduced. Independent bounded source and final visual review cleared this refinement for TST; the known direct-detail control fix is resolved.

No dependency, hosted configuration, provider, credential, entitlement or version change is included. Do not infer signed-in shared-TST or live object-storage upload acceptance from isolated synthetic browser/photo evidence. Preserve historical receipts and unrelated work. For recovery, hide the pilot through its existing entitlement while preserving tasting, override, history and Visit data; no destructive rollback is authorized.

Delivery used the connected GitHub API with an exact tree comparison and a non-forced branch update leased to base `f6a6b3b2`. Canonical alias: https://neat-tst.vercel.app. Production/main remains `0f027ae7d90b5eb8444ad5cfbdc93ca7c90648e9`; no production push/merge or release tag. Documentation-only receipts follow the tested application commit. The local acceptance server was stopped after the final captures; scratch/review files remain unstaged.
