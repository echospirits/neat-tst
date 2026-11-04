# Unreleased

Version **0.7.0-dev** is open for the owner-authorized application-wide interface upgrade in **neat-tst only**. Version 0.6.0 remains the released production baseline. The upgrade is for review before release; no production promotion or tag is authorized. The earlier Operational Signals and retained maintenance entries below are preserved as historical technical manifests, not additional changes introduced by this UI work.

- [0.7.0 upgrade plan](0.7.0-plan.md)
- [0.7.0 pending release checklist](0.7.0-checklist.md)
- [0.7.0 validation and TST receipt](0.7.0-validation.md)

- [0.6.0 release notes and technical manifest](0.6.0.md)
- [0.6.0 completed checklist](0.6.0-checklist.md)
- [0.6.0 validation](0.6.0-validation.md)
- [Source-line exclusion validation](production-invoice-exclusion-validation.md)
- [0.5.2 release notes](0.5.2.md)
- [0.5.2 validation](0.5.2-validation.md)
- [0.5.1 release notes and validation](0.5.1.md)
- [0.5.0 release notes](0.5.0.md)

Production application candidate `c5dcf07b8cc775488a3be9b69766e748bad3fb6f` is tagged `v0.6.0`; stable TST application candidate is `d2f5c32d5badc5688c2a05ee54b50804ff3b1800`. Production deployment `dpl_f9R4uGyi2Q6D3BYPVZms5xCyjZt3` is READY and health verified `production / ohlq-field-crm`.

## Changes

### 0.7.0-dev - Echo-informed working interface

- Owner-authorized November 4, 2026: apply the approved [UI/UX Guidelines](../UI-UX-GUIDELINES.md) across the current TST application. Baseline TST is `ef41fe8fb5810dd52cadfecab09dd4d8d995a829`; production/main observed before work is `4f39e5b89703373c6730d2d590e3262da93c6648`. Preserve all current forecasting and operational behavior, including separate immediate demand and delivery availability.
- Shared visual system: Copper/Patina accents, Chalkboard navigation/text, neutral working surfaces, readable fixed type scale, compact heading/toolbars, modest radii and aligned numerical values in light and dark themes. Existing Echo organization color data is retained; the approved Echo product palette is owned by shared CSS.
- Browsing and visibility: compare Pipeline, intelligence and forecasts in semantic tables; expose useful directory columns, next commitments, saved account profile/plan facts, task details and actionable sync/source failures. Menus contain infrequent actions rather than important current data.
- Correct presentation semantics: Pipeline displays the earliest open commitment, including overdue/undated work, while retaining the prior future-only attention-model inputs. Missing purchase evidence reads `No recorded purchase`. Paused calendar synchronization is a neutral state rather than a failure; actual errors remain alerts. History Clear filters resets all picker/date state consistently.
- Daily work: show scheduled events and overdue work; lead Tags/Users with records, keep invitation/creation secondary, surface known visit context and common contact choices, and add compact global Visit History comparison while preserving account timelines.
- Analytics/admin: compact metrics and operational summaries, visible continuity/execution/source-health data, deliberate editing areas and concise labels/local qualifiers. Remove routine introductory instructions while retaining material warnings, source limits and recovery guidance.
- Scope and evidence: [application UI audit](../design/neat-tst-ui-audit-2026-11-04.md), [upgrade plan](0.7.0-plan.md) and [validation](0.7.0-validation.md). Production approval, stable candidate version, exact-candidate release gates and promotion remain pending.
- TST delivery: application commit `a9d850380e90caceebc3f3376d4e294b293216a3` is READY on `neat-tst`, with verified `test / neon-neat-tst / connected` health and authenticated read-only checks across ten representative routes. Full regression: 997 tests pass; strict typecheck, optimized build and responsive fixture checks pass. Exact scope and remaining owner/stable-candidate acceptance are in the validation receipt.
- No database/schema/migration, provider, credential, scheduled workflow, entitlement, dependency, or hosted environment-setting changes. Existing backend queries/actions and calculations are preserved. No production/main push or release tag.

### Production Forecasting - Operational Signals

- User-visible: **Yes**. Owner-authorized TST-only extension under existing version `0.6.0`; no new development cycle, production promotion or release tag.
- Add separate daily OpenDock GPT/GRN LTL delivery observations, retained history, calendar-day lead times and deterministic seasonal/nearby-period/trailing comparisons. Sparse history stays insufficient; failed checks retain the last success.
- Add OPS Item Coverage agency replenishment estimates: MIN coverage only, per-store whole cases to reach MIN, summed by Organization product and verified agency-prefix warehouse mapping. Show separately from the unchanged statistical 30/60/90-day forecasts. Overnight inventory can lag same-day shipments/receipts; this is not a committed order total or an additive production requirement.
- Dashboard and product detail show separate forecast, demand and delivery freshness, unavailable/stale states and lightweight histories. Background ingestion extends the existing TST 7:27 AM Eastern source workflow; dashboard views query only Neat.
- Migration: `20261104010000_production_operational_signals` adds five tenant-scoped credential/observation/check tables. No destructive SQL or historical forecast changes. No backfill or entitlement change; existing Echo/OH `PRODUCTION_FORECASTING` pilot remains required.
- Configuration: owner chose to keep the verified existing OHLQ encryption key; no new key or secret configuration was added. Optional dedicated `PRODUCTION_OPERATIONAL_CREDENTIAL_ENCRYPTION_KEY` is for initial setup; changing an existing connection requires coordinated compatible credential migration and matching application/runner secrets first. Enter authorized OpenDock credentials through Production Forecasting -> Configure OpenDock; successful API discovery verifies the confirmed warehouses and unique LTL type before atomically saving credentials/mappings. Administrator **Check delivery availability** captures/reuses daily observations without running OPS or forecasts. No passwords, cookies or tokens in source.
- Staging readiness: application commit `13ed8a25c326a2d931e0257716d913467dd1e2bd` is READY on `neat-tst`; health verifies `test / neon-neat-tst / connected`. Additive migration applied/registered only on verified TST after isolated rehearsal. Live OPS acceptance persisted16 valid estimates/17 checks, matching source calculations; the one upstream A3A Dist item remains unavailable. Existing238 forecast values remain unchanged. Authenticated hosted dashboard/detail acceptance passed, including mobile. Owner-entered OpenDock login verified both LTL mappings. First November4 API observations match native calendars: GPT November10 06:00 EST (6 days), GRN November6 06:00 EST (2 days); duplicate checks reuse both saved daily facts. The first new morning ingestion run remains pending. Exact checks/limits: [operational signals guide](../production-operational-signals.md) and [checkpoint](../../production-operational-signals-checkpoint.md).

The cumulative forecast horizons and approved invoice correction are released and archived. The TST-only maintenance below is preserved in full and remains outside the production release.

### Retained TST maintenance

The 0.5.2 inline-editor and 0.5.1 address-link hotfixes are released and archived. The same-version [OHLQ stale-source warning correction](0.5.0-ohlq-warnings.md) was also separately released to production. The TST-only test and tooling changes below remain excluded from production.

Owner-authorized test/developer-tooling maintenance, October 29, 2026. The application feature freeze and version 0.5.0 remain; this maintenance does not open a feature cycle or authorize production promotion.

- Remove 28 obsolete or duplicate test cases while retaining current security, lifecycle, calendar and retirement guards; preserve unique state-change audit assertions in the stronger whole-module test.
- Add an explicit-file `test:focus` command and document focused iteration with one full-suite delivery gate. Remove artificial per-record fixture timers without removing concurrency coverage.
- Exclude scratch copies under `output/`, `tmp/` and `.codex-worktrees/` from TypeScript discovery. No cleanup files are deleted.
- Correct integration instructions that still referenced deleted SMS/Recipe scripts and retired mailbox/AI behavior.
- Validation and exact scope: [test efficiency audit](../engineering/test-efficiency-audit.md). No application runtime, dependency, schema, migration, provider, feature flag or hosted-setting changes.

## Entry template

- Description and user-visible behavior:
- Relevant TST commit(s):
- Validation and known limits:
- Migration, backfill, environment/configuration and feature flags:
- Release/recovery notes:
