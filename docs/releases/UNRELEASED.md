# Unreleased

The November 5, 2026 owner-requested investigation authorizes a focused Wholesale Orders automatic Filed repair in TST. Production remains at the verified **0.7.1** release; promotion requires a separate production release instruction. No broader development cycle is opened.

- Production application: `066b66ead25095c138ed2f5bd5b739e64ea55ec3`.
- [0.7.1 release notes](0.7.1.md), [checklist](0.7.1-checklist.md) and [validation](0.7.1-validation.md) record the exact CI, source, configuration, deployment and authenticated acceptance evidence.
- Historical [0.7.0 release records](0.7.0.md) and earlier tags/records remain preserved. Unrelated TST maintenance was excluded from production.
- Existing organization JSON fallback was configured for production James; no schema/migration, dependency, hosted environment, entitlement or production user/password/invitation change.

## Changes

- Wholesale Orders automatic Filed reconciliation: bridge Brand Master supplier names to report vendor IDs through exact shared product codes; honor explicitly stored account permit aliases without inferring location suffixes; keep manually completed orders as evidence reservations. Exact A3a store, sale date through +7 days, full product quantities, ambiguity and one-use evidence safeguards remain.
- Baselines: production `9b4bd8dd8b14ef6b81b628479b3a6780864be2f2`; TST `39b8a2571d17d0f061e17da422321c926a157c23`. See [investigation and validation](../engineering/wholesale-order-reconciliation-2026-11-05.md) for checks, remaining permit review and delivery evidence.
- No migration, dependency, feature flag, hosted environment or provider configuration change. Sent and Paid remain manual. Original order snapshots/PDFs and manual filing history are preserved.
- Owner-confirmed data correction: added report permit `03362482-2` as a non-primary alias for Antiques on High at 714 S High St in TST and production. Existing primary permit and other aliases remain. No production order status was changed.
- Validation: 48 focused tests, all 1,038 full-suite tests, strict typecheck and optimized offline build pass. A fresh production-data replay after the confirmed alias matches all six pending orders; a second pass files zero additional orders. Actual production reconciliation remains pending separate code promotion.
- Recovery: after separately approved production promotion, run the normal wholesale import or reconciliation against retained report rows. Reports older than the configured retention period may require a normal historical report refresh; do not fabricate or rewrite saved order evidence.

## Entry template

- Description and user-visible behavior:
- Relevant TST commit(s):
- Validation and known limits:
- Migration, backfill, environment/configuration and feature flags:
- Release/recovery notes:

## Retained TST history

- [Complete historical TST development manifest](0.7.0-tst-development-manifest.md), including TST-only maintenance. This is preserved provenance, not new production scope or a new development cycle.
