# Events, tastings and staff scheduling

Events extend EventShift inside My Schedule. Supported types are tasting, training, consumer/account event, tour, sampling and promotion. Capture date/time, location, account, staff, products/quantities, attendance, samples, costs and outcomes. Edits use optimistic versions; repeated creates deduplicate. Overlapping open/confirmed staff assignments are rejected. A cancelled event remains in history.

Account events link to canonical Log Visit for uploaded photo proof and Worklist follow-ups. Event pages display those existing visits through the shared activity component. External HTTPS photo links can also be recorded. Event entry does not itself count as a physical visit.

Eventbrite uses a tenant-owned encrypted token and organization ID, verified by read access before saving. Each explicit import processes one bounded page and persists its cursor; failures retain the cursor. A nonproduction mock is provided. New provider records enter My Schedule; subsequent provider values are retained for review without overwriting local schedules, staff or outcomes. Attendance is entered from verified event results; attendee personal information is not imported. Disconnect removes the stored credential and retains CRM history.

Observational comparison supports 7–90 day windows immediately before/after the event or the same prior-year period. The event date is excluded. Totals use tenant-product DAILY_V3 wholesale ledger events and require full daily coverage. Missing/future coverage stays unknown. Report dates are not exact order timestamps. These observations do not establish causation. Agency event attribution is unavailable until an equivalent daily tenant-product coverage source is supported.

Legacy EventShift rows remain unassigned to tenants until their ownership is verified. Tenant pages never display unassigned rows.
