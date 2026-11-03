# Unreleased

Version **0.6.0-dev** is open in TST for the owner-authorized 30/60/90-day Production Forecasting extension only. Production remains **0.5.2**. No production promotion is authorized.

- [0.6.0 development plan](0.6.0-plan.md)
- [0.6.0 candidate checklist](0.6.0-checklist.md)
- [0.6.0 development validation](0.6.0-validation.md)

- [0.5.2 release notes](0.5.2.md)
- [0.5.2 validation](0.5.2-validation.md)
- [0.5.1 release notes and validation](0.5.1.md)
- [0.5.0 release notes](0.5.0.md)
- [Completed release checklist](0.5.0-checklist.md)
- [Release validation](0.5.0-validation.md)

## Changes

### Production Forecasting horizons

- One compact cumulative Next 30 / 60 / 90 days selector updates the existing dashboard and product detail. Filters, selected organization and return context remain intact; longer horizons do not add parallel pages or repeated product sections.
- Each location uses one nonnegative 90-day forecast path, with cumulative 30/60/90-day totals. Model selection pools horizon-specific historical error; ranges, prior-year comparisons, confidence, planning targets and saved actuals use the selected horizon. Existing saved predictions remain retained. Legacy runs show longer horizons as awaiting refresh.
- Confidence remains a rating based on evidence, not a probability. Location evidence exposes historical predictions versus actuals, error metrics and confidence limits. A read-only audit supports all three horizons without creating forecasts or changing source data.
- Baselines verified November 3, 2026: production `5f31360c02e6409ec889863340825401c588deea`; TST `a5a2b4dbc26192119460fa2b5be1ec6df4abae45`. Existing TST-only test/tooling differences below are preserved.
- Validation: [development evidence](0.6.0-validation.md). No schema migration, dependency upgrade, feature entitlement, provider or hosted configuration change. Package/lockfile changes are version metadata only.
- Recovery: revert the feature code to retain the 30-day view. Stored JSON is additive; source observations and old forecasts remain intact. A normal successful source refresh generates the new horizons.

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
