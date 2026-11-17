# Scheduled-job usage controls — November 17, 2026

Owner-authorized operational changes to reduce Vercel usage. Production baseline: `1076b724`; TST baseline: `59a21824`. Production stays at 0.10.1; TST stays at 0.10.0-dev. This does not open a development cycle or promote unrelated TST features.

## Requested state

- **TST OHLQ:** remove the daily Vercel trigger and GitHub Actions schedule. The GitHub job additionally rejects scheduled events; manual dispatch remains available. Existing TST `OHLQ_IMPORT_ENABLED=false` and `CRON_JOBS_ENABLED=false` are retained.
- **Supplies, both repositories:** six hours between automatic provider batches (at most four per 24 hours), including incomplete imports and retry attempts. GitHub ownership/recovery watchdogs run at 00:08, 06:08, 12:08 and 18:08 UTC. The production daily Vercel watchdog remains recovery-only.
- **TST Supplies:** `SUPPLY_JOBS_ENABLED=false`, remove its Vercel watchdog, and explicitly disable the GitHub job independently of its saved repository variable. Existing workflows consult the current canonical endpoint before further work and stop after deployment handoff. Manual consent/settings and retained records are preserved.
- **TST account research:** `ACCOUNT_RESEARCH_PILOT_ENABLED=false` disables retail public-hours web research and manual wholesale research; `ACCOUNT_RESEARCH_AUTOMATION_ENABLED=false` disables automatic wholesale research. Remove the unused TST research cron as well. Production research settings are unchanged.

## Timing and compatibility

The durable timer, not the Vercel cron, owns the Supplies cadence. A work claim reserves the next six-hour slot before provider calls, so interruption/replay cannot restore frequent polling. Normal completion waits six hours from completion, so mailbox due times computed during work are ready at the next check. Redeployment and terminal-run recovery preserve the reserved slot and existing work lease. Legacy 15-minute checkpoints upgrade without losing counters or history.

Mailbox settings accept valid legacy values while enforcing an effective 360-minute minimum, preserving saved team/access grants and longer intervals. No database rewrite or migration is required. Import cursors, provider backoff, mailbox leases, deduplication, source evidence and tenant/owner authorization remain authoritative. Backfill and error recovery will progress more slowly because they also wait until the next six-hour check.

## Validation and delivery

Pending final full suites, strict typecheck/build and hosted readback. Focused scheduler/config checks pass, including frequent watchdogs over 24 hours, legacy checkpoint upgrade, provider failures/backlog, interrupted persistence/replay/takeover, and mailbox scan timestamps later than tick start. Independent review found no remaining blockers after the two recovery/timing corrections.

No UI layout, dependency, schema, credential, provider-account or production OHLQ/research change. Browser layout acceptance is not applicable; affected hosted routes and durable scheduler state must be verified. Historical release records remain unchanged.
