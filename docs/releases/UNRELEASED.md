# Unreleased — 0.5.0-dev

Opened October 28, 2026 for the owner-approved interface mockups, desktop navigation consistency, and compact account briefing. Production has since advanced through the separately authorized 0.4.1 performance hotfix and **0.4.2** forecast download hotfix ([release receipt](0.4.2-validation.md)); the interface work remains TST-only. [Development plan](0.5.0-plan.md), [pending release checklist](0.5.0-checklist.md), [validation](field-workspace-validation.md). No interface production release is authorized by this development task.

- Opening production: `f7f5d8012751f79875e3f6d0999dc28ad02cb926` (0.4.0).
- Opening TST: `cc8b47d217a79ab0a7bab0c679ad02f5833bbd8b` (0.4.0); opening trees match.

## Changes

### Production source download repair — released separately as 0.4.2

- Match Bailment's actual `From`/`To` date labels, retaining the existing date labels for other reports; verify the requested dates remain selected. Wait for Partner DC's positive unfiltered table count and displayed rows before capturing export completeness, so its initial zero-row loading shell cannot reject a valid full CSV.
- Add safe report-control and export-stage diagnostics plus a TST-only live download acceptance check using existing scoped credentials. It validates complete native reports without importing facts or refreshing forecasts; raw reports and screenshots remain private runner-temporary files.
- Validation: live TST downloads and the actual production import/refresh passed. Production has 6,001 demand observations, 60 guidance observations and 19 numeric eligible forecasts with no duplicate demand identities. [Source download validation](production-source-download-validation.md), [production receipt](0.4.2-validation.md).
- Released under separate owner authorization as `v0.4.2` at `5143a53a`. No migrations, credential/configuration changes or additional recurring schedule. Existing OHLQ concurrency is preserved. These source fixes are already in both trees and must not regress during 0.5.0 promotion.

### Navigation and account performance

- Account pages start independent reads concurrently and show loading indicators for secondary panels. Identity-only reads no longer load the account directory solely to authenticate or read scalar organization settings. Nested account selections and writes retain state enforcement.
- Validation and limitations: [performance validation](0.5.0-performance-validation.md). Production latency improvement has not yet been measured.
- Migration, backfill, environment/configuration and feature flags: None. The account performance changes were separately released to production as 0.4.1 at `91cd60f4`; the field-workspace presentation changes below remain TST-only.

### Field workspace, account sections and useful briefings

- Description and user-visible behavior: Consistent grouped desktop navigation; named account tabs replace stacked placement/purchase/intelligence disclosures. Overview leads with Notes, Contacts, Outstanding work, and a compact briefing. Unrecorded facts are omitted, one empty state replaces repeated missing-data rows, and relationship evidence remains available. Mobile account Log Visit/Directions preserve context. Worklist leads with account identity, live search, named advanced filters and relative urgency. Empty schedules show a concise personal state and separate unassigned team work. Visit forms keep optional detail secondary and Save/Cancel reachable.
- Worklist search now also matches linked restaurant and retail account names before applying the result cap, including legacy retail references and tenant-scoped source-visit follow-ups. Existing task text, owner, status and feature filtering remain in force.
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
