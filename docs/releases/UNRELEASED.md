# Unreleased

Stable **0.7.0** remains the current release. The owner-authorized focused quality-of-life pass below targets TST only, retaining version 0.7.0 and opening no new development cycle. The earlier interface technical manifest and retained historical Operational Signals entry are archived in [0.7.0 release notes](0.7.0.md). Exact stable-release validation and the verified `v0.7.0` tag are recorded in the [completed checklist](0.7.0-checklist.md) and [validation receipt](0.7.0-validation.md).

- Production application: `5023578de6bfda370ea547af7b1cb5494bbdfe70`.
- Stable TST application: `214e0fe0cfb7d3184416408ea400ab0a023f7951`.
- Both deployments are READY; health verifies `production / ohlq-field-crm / connected` and `test / neon-neat-tst / connected` respectively.
- Historical [0.6.0 release notes](0.6.0.md) and [Operational Signals production promotion](production-operational-signals-promotion.md) remain preserved.

## Changes

### Quality-of-life improvements — November 4, 2026

- Replace required pre-save Worklist completion choices for physical Visits with an optional **Complete related work?** bottom sheet after save. Individual and all-item actions use normal Worklist completion, retaining tenant/account/assignment checks, history and calendar side effects; dismissal leaves work open. No blanket automatic completion was found in the prior implementation.
- Remove the post-Visit Opportunity **Mark actioned / Keep open** interruption and its confirmation-only mutation; preserve records, Visit links and Opportunity business logic.
- Show the authoritative Ohio Agency number immediately below its name, preserving leading zeroes and removing the lower duplicate.
- Align overdue/undated Schedule work in a consistent responsive list, allow long task/account names to wrap, and keep Worklist rows/actions within the mobile viewport.
- Move **Current Inventory** from Intelligence to the top of Agency Overview, using the existing current-inventory service with explicit organization/product scope, freshness, stock, minimums and status. Core inventory no longer depends on Intelligence entitlements.
- Assign Reactivation Follow-ups to the latest qualifying Visit's active same-organization user, otherwise the configured organization fallback. Preserve 30/90-day qualification, valid existing ownership, completed history and repeated-import matching; add a tenant-scoped unique submission key for concurrent imports. Echo-specific qualification remains restricted to Echo's source data.
- Configuration: existing `Organization.settings.defaultReactivationAssigneeUserId`; no schema migration, backfill, dependency, environment-variable or feature-flag change. At the owner's explicit request, created James Clifford's TST sales-user record (`james@echospirits.com`, `usr_james_clifford_tst_20261104`) and configured Echo's fallback to that ID with an organization audit receipt. No password/invitation/email or production configuration change. See the [assignment runbook](../engineering/reactivation-assignment.md).
- Validation and exact TST delivery: [quality-of-life validation](qol-2026-11-04-validation.md). Production/main and historical release refs are outside scope. Removing the fallback setting restores unassigned behavior for newly created follow-ups without a qualifying Visit; existing valid owners/history remain intact.
- Application commit: `999d324ed93c9a00a07c921dd6f611c8303535e9`, delivered only to `neat-tst/tst`, deployment READY with correct test database health. Full suite 1,028 passing; focused set 117 passing; typecheck/build passed. Authenticated mobile Visit save/dismiss/individual/all completion and empty-prompt checks passed with labeled TST acceptance records; live Agency mobile/desktop inventory and mobile overdue layout passed.

## Entry template

- Description and user-visible behavior:
- Relevant TST commit(s):
- Validation and known limits:
- Migration, backfill, environment/configuration and feature flags:
- Release/recovery notes:

## Retained TST history

- [Complete historical TST development manifest](0.7.0-tst-development-manifest.md), including TST-only maintenance. This is preserved provenance, not new production scope or a new development cycle.
