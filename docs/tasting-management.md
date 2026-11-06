# Tasting Management Phase 1

Owner-authorized TST pilot, November 5, 2026, with unrestricted workflow status selection and narrow inline assignment authorized November 6. Application version **0.7.2** is retained. This feature has no production promotion or release tag. See [initial validation and delivery receipts](releases/tasting-management-validation.md), [status-selection validation](releases/tasting-unrestricted-status-validation.md) and [current inline-assignment evidence](design/tasting-inline-assignment-2026-11-06.md) for completed checks and remaining delivery gates. The current guidance below supersedes earlier status/assignment restrictions; earlier validation receipts remain historical evidence.

Phase 1 covers tasting proposals, taster responses, Agency and State decisions, assignment, cancellation, Visit evidence and automatic same-day retail sales observations. Inventory readiness, risk scoring, predictive scheduling, route planning, availability calendars and State application generation/submission are outside this phase.

## Access and daily use

`TASTING_MANAGEMENT` is an optional entitlement, disabled by default. The additive migration explicitly enables the pilot for stable organization ID `org_echo_spirits`; runtime access never matches an organization name. The feature depends on the existing Visits, Agencies and tasting-visit capabilities. Other tenants remain dark unless explicitly enrolled.

- **Coordinators:** organization administrators create and edit proposals, assign an active tenant user, choose an existing Agency/contact, record milestone evidence, select any workflow status for a tenant tasting, import a reviewed schedule and change spacing settings.
- **Assigned tasters:** open their Tastings and My Schedule, select any workflow status for their own assignment, read taster notes, open shared Agency information, get directions and log their tasting Visit on its scheduled date. Status selection does not grant scheduling or coordinator authority.
- **Sales users:** can read the enabled tenant schedule and change the assigned taster through the narrow main-page control. Sales is the existing `USER` role. This does not grant full proposal editing/settings, administrator approval authority or another taster's status/response authority. The `TASTER` role cannot reassign its own or another tasting.

The server resolves the signed-in user and organization. Tasters see only their assignments. Their Agency view exposes shared store information and their own tastings, without the general account's private overlays or full timeline. Internal coordinator notes, import metadata and private history snapshots are redacted for non-administrators. Another organization cannot read or mutate these records.

`/tastings` offers **Workflow / Upcoming**, **Calendar** and **History**. Calendar supports a month or week; phones use a responsive list treatment. Workflow groups the current proposals by derived status. History includes completed, cancelled, denied and unresolved past proposals. Search uses Agency name/number. Large result sets are bounded and have continuation controls.

Change status from each tasting's dropdown on Calendar, Workflow / Upcoming, History or tasting detail. Administrators and the assigned taster may choose any of the twelve workflow values at any time, forward or backward, including reopening a Cancelled, denied or Completed label. The choices are **Draft**, **Needs Taster Response**, **Taster Approved**, **Taster Needs Edit**, **Awaiting Agency Approval**, **Agency Approved**, **Agency Denied**, **Submitted to State**, **State Approved**, **State Denied**, **Cancelled** and **Completed**. Choosing Draft retains the assignment. Ordinary choices save on selection; Taster Needs Edit and Cancelled require an inline explanation, and denial offers an optional reason before saving. Success stays visible when a tasting moves groups, failures retain the prior saved status and entered reasons, and filters/URL stay in place. Other users cannot change another taster's status.

The selected workflow label is separate from recorded approvals and Visit execution. Selecting State Approved does not invent earlier approvals; selecting Completed does not create a Visit, photo, completion timestamp or completion link. A manually Completed tasting without qualifying Visit evidence shows **Visit not logged**. Real Visit/photo evidence remains preserved even if its visible workflow label changes. **Import Needs Review** is a factual import flag, not a selectable workflow value; changing the label does not resolve import identity/provenance issues.

Agency Overview shows upcoming/recent tastings and available outcomes; Activity includes meaningful tasting history. My Day/My Week show the user's assignments from `TastingEvent` directly. No duplicate Worklist task is created. Worklist remains the follow-up source of truth.

## Change the assigned taster inline

Administrators and Sales users can change the taster directly in Workflow / Upcoming and History's Taster column, or in Calendar. Open the searchable picker and select an eligible active user from the current tenant; the new choice saves immediately. Platform-admin accounts are excluded as assignment targets. TASTER sees only the saved name and is not sent the option list. The picker shows saving/error feedback and retains the saved assignment on rejection; it does not offer a blank/unassigned choice.

Terminal workflow labels explain **Reopen status to reassign** for an administrator or assigned actor with existing status permission. A nonassigned Sales user sees **Ask an administrator to reopen status**. A qualifying completed Visit shows **Visit logged · assignment locked** and remains immutable even if the visible workflow label changes. Inline reassignment does not grant date/time, Agency, contact, notes, import or settings edits. The searchable controls use readable touch targets; mobile may show fewer complete records in the first viewport, with the remaining facts available by scrolling.

The server accepts only the tasting ID/version and selected user ID, then reloads the stored proposal. It rechecks tenant/feature/active-user and target eligibility, optimistic version, scheduling lock, overlap/spacing and canonical reset/history rules. Reassignment resets the taster response for review and preserves applicable Agency/State evidence and historical records. The inline action has no spacing-override field; resolve conflicts through the existing authorized administrator workflow. Browser acceptance and delivery of this refinement remain tracked in [assignment evidence](design/tasting-inline-assignment-2026-11-06.md).

## Stored model and workflow

`TastingEvent` belongs to one organization and references real Agency, user and optional tenant Contact IDs. It holds the Eastern business date, UTC start/end instants, taster/internal notes, creator, timestamps, optimistic version, milestone evidence, cancellation, lightweight feedback, Visit completion and sales provenance. Nullable `workflowStatusOverride` stores an explicit workflow label without replacing these facts. Imported unmatched tasters may temporarily have no user ID and must be reviewed. Store names/addresses remain sourced from Agency records.

`TastingWorkflowEvent` stores organization, tasting, event type, actor, timestamp, previous/new values and relevant reason. Previous evidence survives resets, cancellation and denial. No-op saves/replays avoid duplicate history. Completed/cancelled/denied proposals remain in these same tables; there is no separate Past Tastings store.

The existing milestone/source mapping remains available independently of manual status selection:

| Observed spreadsheet/milestone value | Recorded evidence |
| --- | --- |
| DRAFT | Taster `PENDING`, Agency `NOT_REQUESTED`, State `NOT_SUBMITTED`; an assigned draft appears as **Needs Taster Response** |
| Taster Approved | Taster `APPROVED`, with responding user/time and exact approved Agency/date/time/assignee snapshot for a Neat response |
| Taster Needs Edit | Taster `NEEDS_EDIT`; **What needs to change?** requires free text |
| Requested Agency Approval | Agency `REQUESTED`, request actor/time and selected Contact if known |
| Agency Approved / Agency Denied | Agency `APPROVED` / `DENIED`, decision actor/time and optional reason |
| Submitted to State | State `SUBMITTED`, submission actor/time |
| State Approved / State Denied | State `APPROVED` / `DENIED`, decision actor/time, optional reason/reference |
| Cancelled | Independent cancellation actor/time and required reason; prior approvals remain |
| Completed | A qualifying linked Visit and persisted photo establish actual execution completion; selecting the same workflow label manually does not establish this evidence |

An explicit workflow selection takes precedence for the visible label. Without one, the display derives from the discrete milestones, with cancellation, completion and denial taking precedence, followed by import review, edit response and the latest recorded approval stage. Execution remains independent: a past proposal without qualifying Visit evidence shows **Visit Not Logged**, and manual Completed explicitly shows **Visit not logged** until evidence exists.

The `SET_STATUS` action accepts all twelve workflow values without milestone prerequisites. Its centralized server authorization permits an administrator in the tasting's organization or its currently assigned taster; future taster-policy restrictions belong in that branch. Tenant/feature checks, active-user checks, optimistic versions and history remain authoritative. Status history records the prior/new label and relevant reason without fabricating milestone actors or timestamps. Existing explicit milestone actions retain their evidence requirements and history; they clear a manual override when recording a new milestone.

Cancelled and denied workflow labels can be reopened through status selection before an administrator edits their schedule. A real Visit-backed completion remains immutable for schedule editing even when its visible label changes; create a new proposal for a different schedule. The assigned taster/coordinator can retain lightweight emails-gathered, post-event notes and taster feedback.

## Changes and approval invalidation

| Change | Result |
| --- | --- |
| Assigned taster changes | Reset the manual status for the revised proposal with history; reset taster response, actor/time/comment and approved-assignment snapshot; request a fresh response |
| Date/start/end changes | Reset the manual status for the revised proposal with history; reset taster evidence, Agency approval/request and State submission/approval evidence |
| Agency changes | Reset the manual status for the revised proposal with history; reset taster, Agency and State evidence; validate the selected contact against the new Agency |
| Notes-only/contact edit | Retain unchanged schedule approvals; record meaningful detail changes |
| Date or Agency changes | Clear the current sales calculation for the old date/store |
| Taster submits Needs Edit after an approval | Retain response/comment/history and reset downstream Agency/State current milestones for coordinator review |

Reassignment alone retains Agency/State evidence for the unchanged store/time. Material edits normally clear the manual override; if preserved cancellation evidence or a reassignment-only retained denial would make a reopened proposal terminal again, the revised proposal instead gets **Needs Taster Response**, with history and the old evidence preserved. Historical snapshots are never deleted when current approval fields reset. Transactions, an organization scheduling lock and optimistic versions prevent an outdated form from approving a different assignment.

## Spacing and double-booking

The default minimum is **10 calendar days** between non-terminal tastings at the same Agency. A proposal 9 days away conflicts; exactly 10 days is allowed. Cancelled, denied and Completed workflow labels do not block the active-proposal rule. Reopened labels become active unless a real completed Visit already makes the record historical. Changing a workflow label does not reschedule the tasting or fabricate scheduling evidence.

Creation/rescheduling shows the conflicting date/time and taster. Administrators must provide a reason to override same-store spacing; the history stores the reason and conflicting tasting IDs. Sales' narrow inline assignment permission does not grant date/time editing or spacing-override authority. An overlapping active assignment for the same taster is a hard block, including overlapping open/confirmed generic events. There is no overlap override or travel-time calculation.

Administrators use `/tastings/settings` to adjust `Organization.settings.tastingMinimumDays` from 0–365 days. The default is centralized; updates preserve unrelated JSON settings, reject stale forms and create an organization audit record. Existing proposals are not automatically rescheduled.

## Log Tasting Visit and completion

On the tasting's Eastern date, **Log Tasting Visit** opens the existing Log Visit flow with the Agency, tasting ID, assigned taster, schedule and return context. Both the existing taster form and full Visit form preserve that context and enforce the required picture. The linked Visit uses the existing Tasting activity semantics; a second Visit system is not introduced.

Actual completion requires a persisted same-day Agency Visit by the assigned taster, the direct `LoggedVisit.tastingEventId` relationship and a qualifying persisted image record with storage metadata. The service rechecks the current assignment fingerprint under the same scheduling lock. Only then are `completedAt` and `completedVisitId` set and completion history recorded. This canonical completion clears a manual workflow override and records its previous value in completion history. Replaying the same linked Visit does not complete twice. Ordinary Visits, unlinked photos and selecting Completed do not silently create execution evidence.

Currently Cancelled/denied workflow labels, another taster's assignment and another tenant's IDs are rejected. Reopen the workflow label before logging a cancelled or denied assignment. Manual Completed without Visit evidence remains eligible for the canonical Visit flow on the scheduled date. A genuine completed Visit remains linked and cannot be replaced by another completion. If a schedule changes while a photo uploads, the saved Visit can remain linked for coordinator review without claiming completion. An unresolved past tasting remains visible in History. Live object-storage upload acceptance is tracked separately in the validation record; synthetic photo metadata is not proof of a live upload.

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

The original additive migration is `prisma/migrations/20261105020000_tasting_management/migration.sql`: milestone enums, `TastingEvent`, `TastingWorkflowEvent`, nullable Visit link, indexes, composite tenant foreign keys, schedule/completion/cancellation constraints and explicit Echo pilot enrollment. The November 6 migration `20261106030000_tasting_status_override` adds nullable `workflowStatusOverride` with a database CHECK limited to the twelve workflow values. It does not backfill labels, rewrite milestones or delete existing Visit/event data. No dependency upgrade, new secret or new provider account is required. Photo uploads continue using the existing object-storage configuration.

`scripts/tasting-management.ts` requires an explicit environment file, expected host and target, then a reviewed migration checksum for apply. It rejects production, verifies its own migration receipt and refuses unexplained existing tasting tables; it does not reconcile unrelated migration drift. Rehearse on an isolated branch before applying to verified `neon-neat-tst`. Do not paste credential-bearing URLs into logs or documentation.

For recovery, disable the tenant entitlement to hide the pilot while retaining all records and historical evidence. Do not delete tables, Visits, overrides or provider data as a rollback shortcut. The original shared-TST migration and explicit Echo enrollment are recorded in the [initial validation](releases/tasting-management-validation.md); its row counts are point-in-time receipts. The status-override migration passed isolated rehearsal with 19 existing tastings preserved, then applied to verified shared `neon-neat-tst` with both existing tastings preserved and zero overrides backfilled. Independent readback confirmed the checksum and validated CHECK. The completed 1,133-test suite, strict typecheck, optimized build and schema validation pass; current browser review and delivery remain separately tracked in [status-selection validation](releases/tasting-unrestricted-status-validation.md).
