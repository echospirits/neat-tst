# Unreleased

The owner authorized **Tasting Management Phase 1** as a scoped TST-only exception on November 5, 2026. Version **0.7.2** is retained; no broader development cycle, main promotion or release tag is opened. The released Wholesale Orders baseline below remains preserved.

- Production application: `12c1d995114203609bb92f833449138ec22bd52c`.
- [0.7.2 release notes](0.7.2.md), [checklist](0.7.2-checklist.md) and [validation](0.7.2-validation.md) record the exact CI, source, deployment and live six-order reconciliation evidence.
- Historical release refs and records remain preserved; unrelated TST maintenance remains excluded from production.
- The released 0.7.2 hotfix had no schema, migration, dependency, hosted configuration or feature-flag change. Its owner-confirmed non-primary Antiques reporting alias and unchanged Sent/Paid are recorded in the release evidence. The separately authorized pilot migration/configuration is listed below.

## Changes

### Tasting Management Phase 1 — TST pilot, November 5, 2026

- **User-visible:** yes. Dedicated Calendar (month/week), Workflow / Upcoming and History; searchable Agency identity, taster approval/required-comment Needs Edit, Agency request/decision and State submission/decision, independent cancellation and retained history. Coordinator notes remain administrator-only; tasters read/respond only to their assignments.
- **Scheduling/execution:** canonical Agency/user/contact IDs; exact approved assignment; deliberate reset of affected approvals on reassignment, reschedule or Agency change. Default 10-day same-store spacing excludes terminal records; audited administrator override requires a reason. Same-taster active overlaps, including existing generic events, are blocked. Admin spacing settings are tenant-scoped and audited.
- **Existing workflow integration:** upcoming/recent Agency summaries and Activity history, assigned My Day/My Week entries and Directions/Open Agency actions. Log Tasting Visit prefills the existing Visit forms; required persisted photo and qualifying same-day linked Visit set completion evidence. No manual Completed selector or duplicate Worklist task. A passed proposal without proof remains Visit Not Logged / Needs Review.
- **Automatic outcome:** exact Agency/date retail bottles for tenant owned/represented Ohio products, per-product breakdown and source/calculation freshness. Completed/retained daily source coverage is required; missing is unknown. Import correction/replay updates one observation safely. This is store/date association, not taster-attributed or causally proven sales.
- **Import:** administrator preview/add-only CSV supports existing visible statuses and current sheet aliases, including Coverage, Approved By, Joe Notes, Event_Key, Emails Gathered and retail bottle-sales evidence. Stable source/Row Keys make replay skip existing records. Unmatched names and uncertain historical data remain review metadata; no user/contact/approver/time is guessed. Current source sheet was reviewed read-only; **real spreadsheet rows are not imported**. ISO dates, explicit Eastern HH:mm, month-row removal and reviewed user ID/email mappings remain operator preparation.
- **Feature flag/configuration:** `TASTING_MANAGEMENT`, default **disabled**; explicit Echo enrollment uses `org_echo_spirits`, not an organization name. Existing feature dependencies are retained. `Organization.settings.tastingMinimumDays` defaults to 10; no new environment variable, credential, dependency upgrade or provider account is introduced. Photo handling uses the existing storage setup.
- **Migration:** additive `20261105020000_tasting_management`; new tasting/history tables and milestone enums, nullable `LoggedVisit.tastingEventId`, composite tenant relationships, indexes/invariants and explicit Echo pilot entitlement. No existing records are deleted. Guarded migration driver verifies explicit nonproduction target and reviewed checksum, and does not reconcile unrelated drift.
- **Validation and limits:** schema validation, final strict typecheck/optimized build and **1,105 tests / 76 suites** pass with zero failures/skips; the small mobile response-placement refinement passed 21 affected checks. Isolated database rehearsal passed nine persisted behavior/tenant/sales groups; scripted browser acceptance passed 15 checks with zero browser errors at mobile/desktop/320px reflow, including light/dark. Shared-TST migration and exact-checksum/entitlement readback pass: Echo enabled, other enabled tenants zero, real tastings zero. Independent final screenshot review and commit/deployment receipts remain pending in [validation](tasting-management-validation.md). Live object-storage upload is **not verified**; rehearsal photo proof is synthetic metadata.
- **Relevant TST commit(s):** pending final tested commit/push receipt. Base `64267a3a`; version remains 0.7.2.
- **Scope/recovery:** existing generic events remain separate. Inventory readiness, predictive/AI scheduling, route optimization, detailed availability and State PDF/automatic submission are excluded. Disable the tenant entitlement to hide the pilot while retaining evidence; do not delete records as rollback. No push/merge to main or release tag.

See the [operator and import guide](../tasting-management.md), [checkpoint](../../tasting-management-checkpoint.md) and [validation/delivery receipts](tasting-management-validation.md).

## Entry template

- Description and user-visible behavior:
- Relevant TST commit(s):
- Validation and known limits:
- Migration, backfill, environment/configuration and feature flags:
- Release/recovery notes:

## Retained TST history

- [Complete historical TST development manifest](0.7.0-tst-development-manifest.md), including TST-only maintenance. This is preserved provenance, not new production scope or a new development cycle.
