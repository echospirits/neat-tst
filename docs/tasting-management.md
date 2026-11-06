# Tasting Management Phase 1

Owner-authorized TST pilot, November 5, 2026. Application version **0.7.2** is retained. This feature has no production promotion or release tag. See [validation and delivery receipts](releases/tasting-management-validation.md) for the checks completed and the remaining activation gates.

Phase 1 covers tasting proposals, taster responses, Agency and State decisions, assignment, cancellation, Visit evidence and automatic same-day retail sales observations. Inventory readiness, risk scoring, predictive scheduling, route planning, availability calendars and State application generation/submission are outside this phase.

## Access and daily use

`TASTING_MANAGEMENT` is an optional entitlement, disabled by default. The additive migration explicitly enables the pilot for stable organization ID `org_echo_spirits`; runtime access never matches an organization name. The feature depends on the existing Visits, Agencies and tasting-visit capabilities. Other tenants remain dark unless explicitly enrolled.

- **Coordinators:** organization administrators create and edit proposals, assign an active tenant user, choose an existing Agency/contact, record approvals, cancel proposals, import a reviewed schedule and change spacing settings.
- **Assigned tasters:** open their Tastings and My Schedule, approve their assignment or explain what needs editing, read taster notes, open shared Agency information, get directions and log their tasting Visit on its scheduled date.
- **Other organization users:** can read the enabled tenant schedule. They cannot coordinate proposals or respond for another taster.

The server resolves the signed-in user and organization. Tasters see only their assignments. Their Agency view exposes shared store information and their own tastings, without the general account's private overlays or full timeline. Internal coordinator notes, import metadata and private history snapshots are redacted for non-administrators. Another organization cannot read or mutate these records.

`/tastings` offers **Workflow / Upcoming**, **Calendar** and **History**. Calendar supports a month or week; phones use a responsive list treatment. Workflow groups the current proposals by derived status. History includes completed, cancelled, denied and unresolved past proposals. Search uses Agency name/number. Large result sets are bounded and have continuation controls.

Change status directly from the main page using each tasting's dropdown. Normal transitions save on selection; Needs Edit and cancellation require an inline explanation, and denial offers an optional reason before saving. Available choices follow the current milestones and your permissions. Success stays visible when a tasting moves groups, failures retain the prior saved status, and filters/URL stay in place. Completed, cancelled and denied records are read-only; completion still requires Visit/photo evidence.

Agency Overview shows upcoming/recent tastings and available outcomes; Activity includes meaningful tasting history. My Day/My Week show the user's assignments from `TastingEvent` directly. No duplicate Worklist task is created. Worklist remains the follow-up source of truth.

## Stored model and workflow

`TastingEvent` belongs to one organization and references real Agency, user and optional tenant Contact IDs. It holds the Eastern business date, UTC start/end instants, taster/internal notes, creator, timestamps, optimistic version, milestone evidence, cancellation, lightweight feedback, Visit completion and sales provenance. Imported unmatched tasters may temporarily have no user ID and must be reviewed. Store names/addresses remain sourced from Agency records.

`TastingWorkflowEvent` stores organization, tasting, event type, actor, timestamp, previous/new values and relevant reason. Previous evidence survives resets, cancellation and denial. No-op saves/replays avoid duplicate history. Completed/cancelled/denied proposals remain in these same tables; there is no separate Past Tastings store.

| Visible spreadsheet/workflow value | Current milestone |
| --- | --- |
| DRAFT | Taster `PENDING`, Agency `NOT_REQUESTED`, State `NOT_SUBMITTED`; an assigned draft appears as **Needs Taster Response** |
| Taster Approved | Taster `APPROVED`, with responding user/time and exact approved Agency/date/time/assignee snapshot for a Neat response |
| Taster Needs Edit | Taster `NEEDS_EDIT`; **What needs to change?** requires free text |
| Requested Agency Approval | Agency `REQUESTED`, request actor/time and selected Contact if known |
| Agency Approved / Agency Denied | Agency `APPROVED` / `DENIED`, decision actor/time and optional reason |
| Submitted to State | State `SUBMITTED`, submission actor/time |
| State Approved / State Denied | State `APPROVED` / `DENIED`, decision actor/time, optional reason/reference |
| Cancelled | Independent cancellation actor/time and required reason; prior approvals remain |
| Completed | Derived from a qualifying linked Visit and persisted photo; never a manual workflow choice |

The display derives from the discrete milestones, with cancellation, completion and denial taking precedence, followed by import review, edit response and the latest recorded approval stage. Approval and execution remain separate: a past State Approved proposal without qualifying Visit evidence shows **Visit Not Logged / Needs Review**.

Normal actions follow their prerequisites: taster approval precedes an Agency request; an Agency decision follows its request; taster and Agency approval precede State submission; a State decision follows submission. Denied, cancelled and completed proposals cannot have their schedule rewritten. Create a new proposal instead. The assigned taster/coordinator can retain lightweight emails-gathered, post-event notes and taster feedback.

## Changes and approval invalidation

| Change | Result |
| --- | --- |
| Assigned taster changes | Reset taster response, actor/time/comment and approved-assignment snapshot; request a fresh response |
| Date/start/end changes | Reset taster evidence, Agency approval/request and State submission/approval evidence |
| Agency changes | Reset taster, Agency and State evidence; validate the selected contact against the new Agency |
| Notes-only/contact edit | Retain unchanged schedule approvals; record meaningful detail changes |
| Date or Agency changes | Clear the current sales calculation for the old date/store |
| Taster submits Needs Edit after an approval | Retain response/comment/history and reset downstream Agency/State current milestones for coordinator review |

Reassignment alone retains Agency/State evidence for the unchanged store/time. Historical snapshots are never deleted when current approval fields reset. Transactions, an organization scheduling lock and optimistic versions prevent an outdated form from approving a different assignment.

## Spacing and double-booking

The default minimum is **10 calendar days** between non-terminal tastings at the same Agency. A proposal 9 days away conflicts; exactly 10 days is allowed. Cancelled, denied and completed records do not block the active-proposal rule.

Creation/rescheduling shows the conflicting date/time and taster. Administrators must provide a reason to override same-store spacing; the history stores the reason and conflicting tasting IDs. Ordinary users have no scheduling/override authority. An overlapping active assignment for the same taster is a hard block, including overlapping open/confirmed generic events. There is no overlap override or travel-time calculation.

Administrators use `/tastings/settings` to adjust `Organization.settings.tastingMinimumDays` from 0–365 days. The default is centralized; updates preserve unrelated JSON settings, reject stale forms and create an organization audit record. Existing proposals are not automatically rescheduled.

## Log Tasting Visit and completion

On the tasting's Eastern date, **Log Tasting Visit** opens the existing Log Visit flow with the Agency, tasting ID, assigned taster, schedule and return context. Both the existing taster form and full Visit form preserve that context and enforce the required picture. The linked Visit uses the existing Tasting activity semantics; a second Visit system is not introduced.

Completion requires a persisted same-day Agency Visit by the assigned taster, the direct `LoggedVisit.tastingEventId` relationship and a qualifying persisted image record with storage metadata. The service rechecks the current assignment fingerprint under the same scheduling lock. Only then are `completedAt` and `completedVisitId` set and completion history recorded. Replaying the same linked Visit does not complete twice. Ordinary Visits and unlinked photos do not silently complete a tasting.

Cancelled/denied assignments, another taster's assignment and another tenant's IDs are rejected. Logging is available on the scheduled date. If a schedule changes while a photo uploads, the saved Visit can remain linked for coordinator review without claiming completion. An unresolved past tasting remains visible in History. Live object-storage upload acceptance is tracked separately in the validation record; synthetic photo metadata is not proof of a live upload.

## Automatic retail sales outcome

The metric is **Retail bottles sold on tasting date**. It reports same-day Agency sales of the organization's owned/represented Ohio products, without claiming the taster caused those sales.

After a completed daily retail import, the existing OHLQ workflow recalculates relevant enabled-tenant tastings. Opening an authorized tasting also retries the calculation. The calculation uses the Agency's canonical reporting number, the exact scheduled business date, tenant product codes, a completed `ANNUAL_SALES_SUMMARY` import and retained retail daily coverage. No Echo item IDs are hard-coded.

The tasting stores the total, per-product breakdown, source label, calculation timestamp, source-data-through date and source revision. Replaying an unchanged import is a no-op; corrected imports or a changed represented-product set safely refresh the existing observation. Changed outcomes create an audit event rather than another outcome row. An unavailable refresh does not stop independent imports; the detail view can retry.

Missing coverage is **unknown**, not zero. Zero is displayed only when the relevant completed/retained source supports the date and no represented-product bottles were recorded. A previously calculated historical observation is retained if the source later falls outside retention; its source/calculation dates remain visible. Spreadsheet bottle counts and text such as an out-of-stock note are retained as unverified import evidence, never promoted to the calculated retail metric.

## Prepare and import the current schedule

Source reviewed read-only: [Echo tasting schedule, Current Tastings](https://docs.google.com/spreadsheets/d/1cPo7iHZX4l1IdiGEywBPp-zb9y7rYVmJiXZb01E0-ys/edit#gid=460678997). The source spreadsheet reports `America/Los_Angeles`; Neat interprets prepared tasting dates/times explicitly in **America/New_York**. No live spreadsheet rows have been imported by this implementation. The sheet is not a runtime dependency.

The bounded source review included its metadata/header and current November 5–6 rows. It confirmed month/blank separator rows, free-text coverage/approvers, a nonnumeric retail-sales note and an `Event_Key` that must not be assumed unique. This is not a full historical data-cleaning audit.

1. Prepare an export with one real tasting per row. Remove month headings and blank separators. Convert dates to `YYYY-MM-DD` with an explicitly verified year; convert start/end to 24-hour `HH:mm` Eastern wall times. Do not infer an ambiguous year or shift values using the sheet's Los Angeles setting.
2. Keep Agency ID as the existing Agency number or Neat Agency ID. Use an exact active Neat user ID or email for each reviewed taster. Unmatched free-text names are preserved and flagged; the importer does not guess users or Contacts.
3. Add a stable, unique **Row Key** for each real tasting in the prepared export, and retain it across retries. The existing `Event_Key` is source metadata; do not use it as a unique Row Key without checking uniqueness. Use the same stable source key across retries, such as `echo-tasting-schedule-v1`.
4. Open `/tastings/import`, paste CSV and **Preview import**. Resolve row errors and inspect identity/milestone warnings. Changing the CSV/source key requires another preview. Up to 500 rows and 1 MB are accepted; malformed CSV and duplicate/alias-colliding headers are rejected.
5. **Import reviewed rows** creates records without overwriting Neat data. Same source/Row Key replays skip existing records. If Row Key is omitted, the fallback identity includes date/time/Agency/taster, so changing those source values can create another record. Correct imported proposals in Neat rather than reimporting under new identities.

| Current sheet/export column | Import handling |
| --- | --- |
| Date; Start Time; End Time; Agency ID | Required, normalized date/time and real Agency identity |
| Coverage / Assigned taster / Taster | Exact tenant user ID/email, or preserved unmatched name with review flag |
| Status / Current Status | One of the ten visible statuses in the mapping above |
| Notes for taster; Joe Notes / Internal notes | Taster notes and coordinator-only notes |
| Retail Bottles Sold at Agency on Date / Same-day bottle sales | Numeric value retained as historical metadata; nonnumeric text retained as a historical sales note |
| Approved By | Free-text original approver metadata; no Contact or historical approver identity guessed |
| Event_Key | Source event-key metadata; separate from unique Row Key |
| Emails Gathered | Optional nonnegative count |
| Store; Address | Agency record remains authoritative; these source display values are not copied onto the tasting |
| Monthly Total; Employee Color Code; blank column | Not imported into operational tasting state |

Importing a later visible stage records only that observed milestone. It does not fabricate earlier taster/Agency approvals or historical actors/timestamps. Import history records who imported it and when. Imported cancellation records the import-time observation and flags historical uncertainty; it does not assert that the importer originally cancelled the tasting. Administrators must review unresolved identities and any missing explanation for Taster Needs Edit before continuing. Historical completion is never inferred from a spreadsheet status or sales value.

## Migration, operation and recovery

The additive migration is `prisma/migrations/20261105020000_tasting_management/migration.sql`: milestone enums, `TastingEvent`, `TastingWorkflowEvent`, nullable Visit link, indexes, composite tenant foreign keys, schedule/completion/cancellation constraints and explicit Echo pilot enrollment. Existing Visit/event data is preserved. No dependency upgrade, new secret or new provider account is required. Photo uploads continue using the existing object-storage configuration.

`scripts/tasting-management.ts` requires an explicit environment file, expected host and target, then a reviewed migration checksum for apply. It rejects production, verifies its own migration receipt and refuses unexplained existing tasting tables; it does not reconcile unrelated migration drift. Rehearse on an isolated branch before applying to verified `neon-neat-tst`. Do not paste credential-bearing URLs into logs or documentation.

For recovery, disable the tenant entitlement to hide the pilot while retaining all records and historical evidence. Do not delete tables, Visits or provider data as a rollback shortcut. Shared-TST migration and explicit Echo enrollment have been applied and independently verified; real tasting records remain zero. Independent final screenshot review, commit/push, hosted deployment health and live photo-provider acceptance are separately tracked in the [validation record](releases/tasting-management-validation.md).
