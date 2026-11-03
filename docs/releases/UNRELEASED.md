# Unreleased

Version **0.6.0** is released to TST and production. Development remains frozen; no new development version or feature cycle is opened. The released forecasting manifest is archived in [0.6.0](0.6.0.md); only the retained TST maintenance below remains excluded from production.

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
