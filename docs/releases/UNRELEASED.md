# Unreleased — 0.5.0-dev

Opened October 28, 2026 for the owner-approved interface mockups, desktop navigation consistency, and compact account briefing. Neat **0.4.0** remains the production baseline. [Development plan](0.5.0-plan.md), [pending release checklist](0.5.0-checklist.md), [validation](field-workspace-validation.md). No production release is authorized by this development task.

- Opening production: `f7f5d8012751f79875e3f6d0999dc28ad02cb926` (0.4.0).
- Opening TST: `cc8b47d217a79ab0a7bab0c679ad02f5833bbd8b` (0.4.0); opening trees match.

## Changes

### Field workspace, account sections and useful briefings

- Description and user-visible behavior: Consistent grouped desktop navigation; named account tabs replace stacked placement/purchase/intelligence disclosures. Overview leads with Notes, Contacts, Outstanding work, and a compact briefing. Unrecorded facts are omitted, one empty state replaces repeated missing-data rows, and relationship evidence remains available. Mobile account Log Visit/Directions preserve context. Worklist leads with account identity, live search, named advanced filters and relative urgency. Empty schedules show a concise personal state and separate unassigned team work. Visit forms keep optional detail secondary and Save/Cancel reachable.
- Relevant TST commit(s): `Refine Neat field workflows and account sections` and scoped validation/documentation follow-up; final delivery commit recorded in validation.
- Validation and known limits: Full test/type/build, responsive and keyboard/deep-link/form-preservation evidence in [validation](field-workspace-validation.md). Fixture feedback is distinct from live backend/provider acceptance. No temporary admin session is created in shared TST.
- Migration, backfill, environment/configuration and feature flags: None. Preserve tenant scoping, existing role/feature gates, canonical server actions, historical records and Worklist/calendar effects. Communications and other retired features remain retired.
- Release/recovery notes: TST-only. These presentation changes are additive to released 0.4.0. No database rollback is required; production remains on its separately released state.

## Entry template

- Description and user-visible behavior:
- Relevant TST commit(s):
- Validation and known limits:
- Migration, backfill, environment/configuration and feature flags:
- Release/recovery notes:
