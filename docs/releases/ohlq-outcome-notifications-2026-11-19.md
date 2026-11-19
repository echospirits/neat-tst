# OHLQ load outcome notifications — November 19, 2026

The owner authorized implementation, tests and selective promotion to neat-tst/tst and ohlq-field-crm/main, retaining each current version. Production base is `8e0282a773a54209332df5198396927afbae6b68` (0.10.2); TST base is `07213320628f4e787a6c24d276eee52124f1f53f` (0.10.0-dev). Historical tags and unrelated TST changes remain untouched.

## Problem and behavior

On November 19, production run [44519733602](https://github.com/echospirits/ohlq-field-crm/actions/runs/44519733602) completed the current load. Its separately dispatched November 17 replay [44519737435](https://github.com/echospirits/ohlq-field-crm/actions/runs/44519737435) failed installing Chromium's OS dependencies when Ubuntu returned HTTP 503. That failure sent an alert despite complete current data.

The cron now dispatches its frozen report-date batch once. Each requested date is attempted even if an earlier date fails; imports precede the one downstream intelligence refresh. Setup commands and provider reads use bounded retries (three attempts, 15/30-second waits). Only provider download closures retry; parsing, committed imports, reconciliation and intelligence writes do not replay. Existing database reads and fixed-value status writes also recover narrowly recognized uncoded Prisma connection initialization failures.

The normal sync job preserves failed step outcomes but delegates the workflow's terminal result to an independent verification job. That job has its own 15-minute budget and enforces environment/database identity and the validated manifest. It reads a repeatable snapshot in a database-enforced read-only transaction, retrying incomplete/unavailable checks up to three times at 30/60-second intervals. It verifies exact sales receipts/counts, retained valid masters, enrolled tenant inventory and agency intelligence, current wholesale configuration/source revisions and completed assessment coverage, exact forecast provenance/snapshots, and the scheduled operational-source policy. Typed stale-publication and optional lookup/unavailable warnings remain warnings.

Failure or timeout before a manifest, unknown database results, unresolved processing, missing source data and incomplete scoring remain actionable failures. Discovery and Account Sales Status reconciliation lack durable completion receipts: an actual failed attempted stage remains explicitly unverified, even when other persisted checks pass. A setup failure that skipped those stages can use independently certified prior data. The verifier never performs an import or repairs statuses.

Manual purchase-state, credential-repair and production-sources-only commands retain strict outcome behavior. TST's deliberately disabled automatic OHLQ schedules remain disabled. GitHub notification preferences are unchanged; the normal workflow result now describes required data health after recovery.

Sales dates and the requested business-day manifest are fixed before setup. Actual inventory/provider observation clocks remain truthful. A rare manual/queued load crossing Eastern midnight may leave a mixed-day state that cannot be certified; this is reported as unverifiable with `VERIFICATION_CLOCK_ROLLOVER`, not asserted missing data or silently accepted as fresh.

## Scope and validation

No schema, dependency graph, version, product UI, source-date rewrite, secret/account, feature flag or notification-settings change. No historical refs are replaced. UI/browser visual acceptance is not applicable because no rendered components changed; tenant and provider boundaries are checked in behavioral tests and persisted readbacks.

Independent review required read-only retry boundaries, an independent verification budget, fail-closed manifests, matching forecast invoice policy and exact represented wholesale coverage. Those requirements are implemented and regression tested.

Read-only production rehearsal verified November 17/18 sales (82,718/17,157 and 88,801/21,396 retail/wholesale), 497 inventory rows, 608 agency summaries/profiles, all 15,596 assessments, 18 forecast/demand products, 36 warehouse observations and both OpenDock locations. No production writes were made by that rehearsal.

Delivery validation and hosted acceptance receipts will be recorded after the exact candidates finish validation.
