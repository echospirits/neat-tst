# Scheduled-job usage controls — November 17, 2026

Owner-authorized operational changes to reduce Vercel usage. Production baseline: `1076b724`; TST baseline: `59a21824`. Production 0.10.2 and the TST 0.10.0-dev companion payload are deployed READY/healthy. Configuration is delivered; exhausted Vercel Workflow quota prevents full execution acceptance. This does not open a development cycle or promote unrelated TST features.

## Requested state

- **TST OHLQ:** remove the daily Vercel trigger and GitHub Actions schedule. The GitHub job additionally rejects scheduled events; manual dispatch remains available. Existing TST `OHLQ_IMPORT_ENABLED=false` and `CRON_JOBS_ENABLED=false` are retained.
- **Supplies, both repositories:** six hours between automatic provider batches (at most four per 24 hours), including incomplete imports and retry attempts. GitHub ownership/recovery watchdogs run at 00:08, 06:08, 12:08 and 18:08 UTC. The production daily Vercel watchdog remains recovery-only.
- **TST Supplies:** `SUPPLY_JOBS_ENABLED=false`, remove its Vercel watchdog, and explicitly disable the GitHub job independently of its saved repository variable. Existing workflows consult the current canonical endpoint before further work; the quota limitation below prevents confirming the old run has stopped. Manual consent/settings and retained records are preserved.
- **TST account research:** `ACCOUNT_RESEARCH_PILOT_ENABLED=false` disables retail public-hours web research and manual wholesale research; `ACCOUNT_RESEARCH_AUTOMATION_ENABLED=false` disables automatic wholesale research. Remove the unused TST research cron as well. Production research settings are unchanged.

## Timing and compatibility

The durable timer, not the Vercel cron, owns the Supplies cadence. A work claim reserves the next six-hour slot before provider calls, so interruption/replay cannot restore frequent polling. Normal completion waits six hours from completion, so mailbox due times computed during work are ready at the next check. Redeployment and terminal-run recovery preserve the reserved slot and existing work lease. Legacy 15-minute checkpoints upgrade without losing counters or history.

Mailbox settings accept valid legacy values while enforcing an effective 360-minute minimum, preserving saved team/access grants and longer intervals. No database rewrite or migration is required. Import cursors, provider backoff, mailbox leases, deduplication, source evidence and tenant/owner authorization remain authoritative. Backfill and error recovery will progress more slowly because they also wait until the next six-hour check.

## Validation and delivery

Main **1,376 tests/77 suites** and TST **1,551 tests/79 suites** pass; both isolated strict typechecks/builds pass. Final main focused version/configuration/scheduler/job-auth checks pass **28/28**. Required exact-candidate Node **22.23.4/npm 10.9.9** lockfile CI passes in [PR 13 run 44114340685](https://github.com/echospirits/ohlq-field-crm/actions/runs/44114340685). Actual Git/release-check review confirms the selective 14-file production payload excludes unrelated Social Publishing/Tasting work.

Production application **`7437cb7d0d3bf6f02b3f73ebc21de5e2eec76a8a`**, tree `37ef3775c2efbfd113e3785947b2507d758fd470`, version **0.10.2**, is READY on **`dpl_3o8H95jBoEZbZwcBM6VRy6g3hdPa`**; canonical health confirms **production/ohlq-field-crm/connected**. TST application **`3227bed29804315122297e68bf6c4e6ff49e6c88`**, tree `0adef5982a644dcad7922ee3b59f1ba920bd3c78`, version **0.10.0-dev**, is READY on **`dpl_3ZxWTnx1j1D1gfoGPnGoPyHG5Zxg`**; health confirms **test/neon-neat-tst/connected**.

TST's deployed cron list contains only `calendar-sync`, `production-forecasting`, `social-publishing` and `weekly-digest`; OHLQ/Supplies/research are absent. Supplies and manual research flags read back false. The automatic research flag update to false succeeded and remains secret; APP_ENV=test and existing cron/OHLQ flags remain false.

The production watchdog invoked at **15:34:21 UTC on November 17, 2026** persisted new run **`wrun_01M7N2A6JNBXW456GPGMJ412V6`** on the new deployment, **`pollIntervalMs=21600000`**, **`nextDueAt=2026-11-17T20:15:36.153Z`**. It remains **STARTING** under **`ThrottleError`** from exhausted Vercel Workflow quota. An executed six-hour cycle or provider freshness is not verified.

Cancellation of old TST run **`wrun_01M7K5N75AFN0GK8YMZWNWJ7E5`** was rejected by the same quota; it is not canceled. It is the only listed running TST Supplies run, with no pending materialized entries. An old materialized production generation also remains. Queued old runs may retry until quota allows latest disabled/ownership guards to stop them; completed handoff is not claimed. No provider/data cancellation, paid-plan or credential change was made. The local annotated v0.10.2 tag is not published remotely.

No UI layout, dependency graph, schema, credential, provider-account or production OHLQ/research change. Browser layout acceptance is not applicable. Historical release records remain unchanged.
