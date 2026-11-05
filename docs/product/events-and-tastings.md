# Events, tastings and staff scheduling

Events extend EventShift inside My Schedule. Supported types are tasting, training, consumer/account event, tour, sampling and promotion. Capture date/time, location, account, staff, products/quantities, attendance, samples, costs and outcomes. Edits use optimistic versions; repeated creates deduplicate. Overlapping open/confirmed staff assignments are rejected. A cancelled event remains in history.

Account events link to canonical Log Visit for uploaded photo proof and Worklist follow-ups. Event pages display those existing visits through the shared activity component. External HTTPS photo links can also be recorded. Event entry does not itself count as a physical visit.

Eventbrite uses a tenant-owned encrypted token and organization ID, verified by read access before saving. Each explicit import processes one bounded page and persists its cursor; failures retain the cursor. A nonproduction mock is provided. New provider records enter My Schedule; subsequent provider values are retained for review without overwriting local schedules, staff or outcomes. Attendance is entered from verified event results; attendee personal information is not imported. Disconnect removes the stored credential and retains CRM history.

Observational comparison supports 7–90 day windows immediately before/after the event or the same prior-year period. The event date is excluded. Totals use tenant-product DAILY_V3 wholesale ledger events and require full daily coverage. Missing/future coverage stays unknown. Report dates are not exact order timestamps. These observations do not establish causation. Agency event attribution is unavailable until an equivalent daily tenant-product coverage source is supported.

Legacy EventShift rows remain unassigned to tenants until their ownership is verified. Tenant pages never display unassigned rows.

## Tasting Management Phase 1: authorized TST pilot

The owner-authorized November 5, 2026 pilot adds a dedicated `TastingEvent` and `TastingWorkflowEvent` model under optional `TASTING_MANAGEMENT`, dark by default and explicitly enabled for Echo's stable organization ID. It retains version 0.7.2 and does not promote to production or open a broader development cycle. See the [operator/model/import guide](../tasting-management.md) and [validation/delivery record](../releases/tasting-management-validation.md) for current acceptance limits.

For managed Agency tastings, `/tastings` is the schedule/workflow source of truth. Separate taster, Agency and State milestones, independent cancellation and append-only history replace the spreadsheet's single visible status. Assignment/store/time changes invalidate the appropriate current approval evidence while retaining history. Admin scheduling enforces configurable same-Agency spacing (10 days by default, reasoned admin override) and hard same-taster overlap checks, including generic EventShift assignments in both directions.

The assigned taster responds on mobile, sees their My Day/My Week assignments and uses the canonical Log Tasting Visit action with required photo. Completion is derived only from the directly linked qualifying same-day Visit/photo; it is not the generic event editor's manually chosen completed value. Agency summaries and the Activity timeline link back to tasting details without duplicating workflow controls or creating Worklist tasks.

Managed tasting outcomes use the exact Agency/date's completed, retained daily retail source and the organization's owned/represented products. **Retail bottles sold on tasting date** is an association, with source/calculation freshness, unknown missing coverage, idempotent refresh and correction handling. This is distinct from the generic EventShift wholesale before/after comparison above; its windows and exclusions are unchanged.

The reviewed one-time CSV import maps real Agency/user identities, preserves unmatched names/source metadata for review and does not infer historical approvers/times or completion. The current live sheet was inspected read-only and has not been imported. Eventbrite/generic events remain their existing workflow; no automatic conversion, spreadsheet runtime synchronization, inventory readiness, smart scheduling, routing or State PDF/submission feature is added.
