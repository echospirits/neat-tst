# My Day / My Week Scheduler Checkpoint

## Implementation map

- **Source of truth:** `WorklistItem`; no calendar-only task model exists.
- **Schedule fields:** nullable `dueDate` and `dueTimeMinutes` represent undated, date-only, and exact-time work.
- **Duration:** no duration field exists. A persisted duration is not needed for the V1 grid, so no schema change is planned.
- **Calendar abstraction:** `WorklistCalendarEvent` links existing Worklist items to Google events. Existing `scheduleWorklistSync(id)` defers sync after a Worklist write and contains failures.
- **Account/context:** Worklist stores `agencyId`, `wholesaleAccountId`, `salesOpportunityId`, `loggedVisitId`, and product-intelligence context. `getWorklistLocations` resolves account labels in batches and falls back to linked visit context. Tenant-scoped `OrganizationAccountOverlay.isTargeting` supplies the shared Target Account marker.
- **Assignment and tenancy:** My Week filters by current user's ID (with legacy assignee-name compatibility), organization, active status, and a bounded date range plus undated work. Scheduler writes re-check organization and eligible assignees server-side.
- **Existing UI:** `/` is the canonical My Schedule page with dashboard context below the scheduler. Day and Week are view tabs over the same scheduler component; `/my-week` redirects to the Week tab while preserving a valid date.
- **Minimal change:** one Worklist-backed scheduler route with view-specific bounded reads matching the prior Day and Week date windows, narrow tenant-scoped server actions, existing deferred Google sync, and native desktop drag/drop (no DnD dependency is installed).

## Checkpoints

1. Worklist model/schema audit — complete; existing schedule fields suffice, no migration or new environment variable.
2. Desktop My Day — implemented.
3. Desktop My Week and drag/drop — implemented.
4. Mobile Day/Week timeline — implemented.
5. Create and schedule existing Worklist items — implemented.
6. Quick edit/reschedule and contextual actions — implemented.
7. Compatibility and focused tests — complete: 8 focused tests, typecheck, and production build pass.
8. Responsive review and release manifest — complete: 390 x 844 phone and 1440 x 900 desktop review; release entry drafted.

## Decisions

- Use Eastern calendar dates for display and UTC-midnight date-only database boundaries.
- Display exact-time items in the time grid, date-only items in that date's Anytime group, and recent overdue/undated items in the planning tray.
- Keep task identity, account IDs, assignment, notes, opportunity, visit, and product context intact when moving an item.
- Use existing Google Calendar sync scheduling; no parallel calendar mechanism or schema change.
- Work in an isolated TST worktree so shared-checkout changes are untouched; rebase onto the freshly fetched TST tip before publishing.
- After rebasing onto the existing account-targeting release, query `OrganizationAccountOverlay` by organization and only the linked account IDs, then render the shared `TargetAccountMarker` wherever an account-linked scheduler item appears. No targeting state is inferred from sales status.

## Verification and remaining work

- Focused tests: 8 passed. Typecheck: passed after Prisma client generation from the rebased schema. Production build: passed.
- Browser review: desktop My Day and My Week reviewed at 1440 x 900; mobile timeline, week selector, and task action sheet reviewed at 390 x 844. Document width matched the viewport in each layout. Tested empty-slot date/time prefill, mobile date/time/reassignment controls, existing-work search and account search with a fixture response, and failure feedback from safe preview-only actions. Desktop drag/drop fired on the target; a rejected preview action left the original tray item in place and created no visible duplicate. No real Worklist records were changed. The final shared Target Account marker addition passed typecheck and build; its reusable styling is constrained by the existing shared marker CSS.
- Google Calendar: scheduler writes call the existing deferred `scheduleWorklistSync`; no calendar provider or sync behavior was added.
- Original scheduler implementation commit: `98857019`; Target Account marker integration commit: `37307923`. The initial release manifest and checkpoint were pushed to `staging/tst` at `c04b1edc`. No numbered release file, production tag, or push to `main` was included.

## Unified My Schedule follow-up (2026-09-23)

- **Usability:** replaced the separate My Day and My Week destinations with one stable My Schedule navigation item and adjacent Day / Week tabs. The selected date and view stay in the URL for refreshes, browser history, date navigation, and Log Visit return navigation.
- **Preserved behavior:** Day retains its single-day time grid, Anytime and overdue/undated work; Week retains the Monday–Sunday grid, Anytime columns, mobile 7-day selector, and selected-day timeline. Completion, quick scheduling, reassignment, account actions, drag/drop, and New Work / Existing Work are unchanged.
- **Data parity:** Day and Week continue to query their respective prior bounded date windows, with the same tenant, current-user, active-status, intelligence-entitlement, and 300-item guards. The legacy `/my-week` URL redirects into Week.
- **Verification:** 32 focused scheduler, navigation, and tenancy tests passed; typecheck and production build passed. TST desktop review at 1440 x 900 and mobile review at 390 x 844 passed for the combined page, separate grids/timeline, tabs, selected dates, and navigation. The first mobile review found the seven-day selector exceeded its 343px content width by 2px; commit `04b4d819` tightened the gap while keeping each button above 44px. On the Ready `5f2bd3d` TST deployment, all seven buttons measured about 46px, selector scroll width equaled client width, and selecting Friday changed the timeline to Friday. Cross-tab preservation of that selected day is covered by focused test and typecheck; its latest code commit still needs a live TST check.
