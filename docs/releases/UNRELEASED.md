# Unreleased

Version **0.5.1** is released to TST and main. Development is frozen; no new development version or feature cycle is opened.

- [0.5.1 release notes and validation](0.5.1.md)
- [0.5.0 release notes](0.5.0.md)
- [Completed release checklist](0.5.0-checklist.md)
- [Release validation](0.5.0-validation.md)

## Changes

Owner-authorized 0.5.2 hotfix, November 2, 2026: Account Research failures can be edited and saved inline using the canonical restaurant account editor. Current values load on demand; Save/Cancel preserve the research-page context and errors retain drafts. No migration, dependency upgrade, provider activation, configuration or feature-flag change. Scope: [0.5.2](0.5.2.md); gates: [validation](0.5.2-validation.md). Development remains frozen.

The 0.5.1 address-link hotfix is released and archived in [its notes](0.5.1.md). The TST-only changes below remain excluded from production.

### OHLQ stale-source warnings (November 2, 2026)

- Valid older Account/Brand Master publications now skip importing with a GitHub warning and a persistent Warning status. Last successful data and timestamps remain intact. Missing, malformed or future dates, authentication, download, parsing and database errors still fail.
- Data Status displays both new warnings and precisely matched historical stale-master errors as Warning, retaining original audit records. Product discovery does not run after a skipped Brand Master import.
- Additive migration `20261102140000_ohlq_warning_status` adds the WARNING enum value only. Apply before deploying the updated Prisma client or running the workflow. No data deletion, provider/hosted configuration change or dependency upgrade.
- Version remains 0.5.0; this owner-requested reliability correction does not open a feature cycle. Production promotion remains separate under the current release rules.
- Validation and incident evidence: [OHLQ warning correction](0.5.0-ohlq-warnings.md).

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
