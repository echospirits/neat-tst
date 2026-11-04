# Unreleased

Version **0.6.0** is the released baseline. The owner authorized the same-version TST-only Operational Signals extension below; no new development version, broader feature cycle, production promotion or tag is opened. The released forecasting manifest is archived in [0.6.0](0.6.0.md). Retained TST maintenance remains excluded from production.

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

### Production Forecasting - Operational Signals

- User-visible: **Yes**. Owner-authorized TST-only extension under existing version `0.6.0`; no new development cycle, production promotion or release tag.
- Add separate daily OpenDock GPT/GRN LTL delivery observations, retained history, calendar-day lead times and deterministic seasonal/nearby-period/trailing comparisons. Sparse history stays insufficient; failed checks retain the last success.
- Add OPS Item Coverage agency replenishment estimates: MIN coverage only, per-store whole cases to reach MIN, summed by Organization product and verified agency-prefix warehouse mapping. Show separately from the unchanged statistical 30/60/90-day forecasts. Overnight inventory can lag same-day shipments/receipts; this is not a committed order total or an additive production requirement.
- Dashboard and product detail show separate forecast, demand and delivery freshness, unavailable/stale states and lightweight histories. Background ingestion extends the existing TST 7:27 AM Eastern source workflow; dashboard views query only Neat.
- Migration: `20261104010000_production_operational_signals` adds five tenant-scoped credential/observation/check tables. No destructive SQL or historical forecast changes. No backfill or entitlement change; existing Echo/OH `PRODUCTION_FORECASTING` pilot remains required.
- Configuration: optional dedicated `PRODUCTION_OPERATIONAL_CREDENTIAL_ENCRYPTION_KEY` (same value in TST application and morning job); current TST supports the existing OHLQ key, which must not be rotated. Enter authorized OpenDock credentials through Production Forecasting -> Configure OpenDock; successful API discovery verifies the confirmed warehouses and unique LTL type before atomically saving credentials/mappings. Administrator **Check delivery availability** captures/reuses daily observations without running OPS or forecasts. No passwords, cookies or tokens in source.
- Staging readiness: application commit `983a5fd8f88a102cfdb485f4fa1ec610d677b0e8` is READY on `neat-tst`; health verifies `test / neon-neat-tst / connected`. Additive migration applied/registered only on verified TST after isolated rehearsal. Live OPS acceptance persisted16 valid estimates/17 checks, matching source calculations; the one upstream A3A Dist item remains unavailable. Existing238 forecast values remain unchanged. Authenticated hosted dashboard/detail acceptance passed, including mobile. Deployed credential encryption is ready; live OpenDock API proof still awaits authorized login entry and availability verification. Exact checks/limits: [operational signals guide](../production-operational-signals.md) and [checkpoint](../../production-operational-signals-checkpoint.md).

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
