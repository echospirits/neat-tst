# Inline tasting assignment

November 6, 2026. Owner-authorized TST-only refinement on base `098eac18`, application version **0.7.2 retained**. This extends the established main Tastings controls under the [UI/UX Guidelines](../UI-UX-GUIDELINES.md); earlier interface/status validation records remain historical receipts.

## Task and behavior

Administrators and Sales users can change the assigned taster directly in the Taster column of Workflow / Upcoming and History, or beside the assignment in Calendar. The shared searchable RecordPicker shows the current saved assignment and saves a new selection immediately. It keeps Agency/date/time/status facts and the existing URL/filter/return context nearby; no detail/edit page is required. Choosing a person normally takes opening the picker and choosing a match, plus any search typing; baseline task activations were not measured.

This is narrow assignment authority. Sales is the existing `UserRole.USER`, not a new SALES enum. `canAssignTasting` allows `ADMIN`, `PLATFORM_ADMIN` and `USER` within the authenticated organization. `TASTER` sees the saved name only and receives no eligible-user option list. Existing administrator-only full proposal editing/settings and the twelve-status policy are unchanged: a Sales user cannot change someone else's workflow status merely because they can reassign a tasting.

The picker offers eligible active users from the current tenant, excluding platform-admin targets. Pending saves prevent duplicate submissions and show local progress; rejected saves retain the saved assignment and explain recovery. Terminal workflow labels show **Reopen status to reassign** for an administrator or assigned actor with status permission; a nonassigned Sales user sees **Ask an administrator to reopen status**. A real completed Visit shows **Visit logged · assignment locked**, even if its visible workflow status has been reopened. No new blank/unassigned choice is introduced.

## Server boundary and evidence

The new reassignment action accepts only tasting ID, optimistic version and assigned-user ID. It reloads the stored Agency, schedule, notes and contact instead of accepting them from the caller. Organization/feature/active-user checks, eligible target validation, scheduling lock/version, overlap/spacing checks and canonical approval/manual-status resets/history are reused. Inline reassignment supplies no spacing-override reason; an exception still needs the existing administrator workflow.

An assignment change requests a fresh taster response, retains unchanged Agency/State evidence, resets the manual status for the revised proposal and preserves prior history. Existing handling of retained cancellation/denial evidence remains intact. Visit/photo evidence, date/time, notes, contact and sales provenance are not editable through this action. No database migration, dependency, environment/configuration, version, main or release-tag change is included.

## Matched baseline and after evidence

The read-only baseline in `output/playwright/tasting-assignment/before/metrics.json` contains two valid administrator captures with the same four synthetic rows. Both have zero horizontal overflow/browser errors and no submitted actions. The baseline has no inline assignment controls.

| View | Before first-row Y | Before complete first-viewport rows | Before page height | After Y / complete rows / page height |
| --- | ---: | ---: | ---: | --- |
| Mobile, 390 × 844 | 392 | 2 of 4 | 1,336 | 392 / 1 of 4 / 1,438 |
| Desktop, 1440 × 900 | 511 | 3 of 4 | 991 | 511 / 3 of 4 / 1,001 |

After layout evidence is `output/playwright/tasting-assignment/after/metrics.json`, recorded before the bounded focus/copy correction. All five views avoid horizontal page scrolling. Additional captures: 320px Y571/one complete row/1,825px page; dark 390px matches the light layout metrics; root-font 200% Y821/zero complete first-viewport rows/2,960px page, with actual 32px text and all four records/four controls rendered.

The explicit cost is searchable 44px assignment controls: mobile page height grows 102px and complete first-viewport records fall from two to one. Desktop grows 10px and retains three complete records. Working facts remain visible and scrollable; enlarged text requires vertical scrolling. This records the feature tradeoff without claiming improved density or full accessibility conformance. The 390px browse and open-picker screenshots were inspected and found coherent.

Initial browser acceptance passed eight groups: administrator/Sales persisted assignment and reload/scope, TASTER read-only/no options with status authority retained, search/Escape, pending state and simulated 503 recovery, real overlap rejection, terminal/Visit locks and Calendar. It recorded zero browser errors and restored the original six business states. These results do not prove the final settled-focus correction below.

Settled post-save focus initially fell to BODY after the refreshed/versioned control replaced its predecessor; any earlier optimistic focus receipt is superseded. One bounded correction uses an ephemeral browser-only focus bookmark, created before awaiting the save and consumed by the matching refreshed control. It respects another active control and clears its own failure/expiry state (10-second TTL). Final browser confirmation now passes: the old summary was disconnected/version-replaced, the new assignment persisted in the database, query scope remained and focus settled on the new SUMMARY. A fresh actual Sales `USER` check confirmed the exact administrator-reopening note, no reassignment or other-user status authority, and no horizontal overflow. Both confirmations recorded zero browser errors and restored the target's original business state. Evidence: `output/playwright/tasting-assignment/confirm/success-focus-settled.json`, `sales-terminal-note.json` and `browser-errors.json` with their screenshots. The aggregate retains the five initial layouts/eight groups and separately identifies these two corrected-case confirmations; it does not claim a fresh full browser rerun.

## Validation and delivery

| Check | Current receipt |
| --- | --- |
| Initial domain and UI/page/action focused checks | 51 and 24 passed; overlapping scopes are not summed |
| Standalone strict typecheck | Passed before the bounded client correction |
| Completed full suite | 1,164 tests / 76 suites passed; zero failures/skips, 55,398.9335 ms, before the bounded client focus/copy correction |
| Initial and final optimized builds | Passed; final build includes strict TypeScript validation |
| Initial browser/layout acceptance | Eight functional groups and five layouts passed within the stated limits; focus finding superseded the optimistic receipt |
| Final settled-focus and actual Sales terminal-copy browser confirmation | Passed against the final build; old/new DOM replacement and settled SUMMARY focus verified, zero errors, target state restored |
| Final focused regression tests | 27/27 UI/page/action checks passed; zero failures/skips, 1,953.7148 ms (11 component, 9 page, 7 action). Includes three new handoff cases beyond the earlier 1,164-test total |
| Independent final source review | CLEAR; focus handoff/role copy resolved, no remaining actionable issues |
| Exact tested tree, TST push, deployment and health | Pending |

The final correction is limited to client focus and role-appropriate copy. A same-module remount harness verifies focus after refreshed mount before the action response, unrelated-record isolation, one-time consumption, preserving another active control and bookmark cleanup for domain/network failures. Independent source review confirms browser-only effects/events, 10-second expiry and version/assignee matching. Under repository validation guidance, passing affected checks and final build validate that bounded change; no extra full-suite rerun is claimed.

The established Neat palette, typography and shared components are retained; no DESIGN.md/sidecar repair or new raster is required. Earlier delivery receipts do not validate this new assignment permission. Local synthetic/browser checks will not establish human acceptance, signed-in shared-TST acceptance, live provider success or full WCAG conformance.
