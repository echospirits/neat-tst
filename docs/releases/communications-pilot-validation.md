# Communications Pilot validation — 2026-10-12

## Scope and release policy

Continues from TST `9b860bc81e8c98b899ce2d6cfe6b44849b277563`, version `0.2.3-dev`. Includes Communications in v0.2 as a separate Pilot: connected mail/imported appointments, business SMS, and reviewed contact suggestions. COMMUNICATIONS depends on CORE_CRM but is absent from Core/Intelligence/default packages and excluded from broad TST enablement unless the tenant explicitly enrolls. Platform Admin → organization Plan → Pilot persists an audited choice and refreshes navigation. New tenant provisioning and staging seed/reconciliation do not enroll pilots.

Echo Spirits is initially enrolled; Middle West Spirits and Neat Staging are disabled. Future organizations default to disabled. Wider enrollment awaits Echo's review and an explicit Platform Admin change. Phone/email links, ordinary Contacts/Log Visit, Worklist calendar sync and stored history remain available. Provider setup and authorization remain separate; no live connection or credentials were activated.

## Enforcement and validation

- 862 passing tests / 76 suites, no failures, skips or cancellations; final typecheck, optimized build and diff checks pass.
- Actual organization list/direct feature resolution tested under APP_ENV=test: Echo's explicit flag is honored, the other tenant's missing flag remains disabled, and standard TST features retain their prior behavior.
- Actual server actor and Platform plan action tests cover pilot denial even for platform admins, explicit audited enable/disable choices independent of Core/Intelligence, and owner/Support View privacy boundaries.
- Services guard OAuth start/completion, mail ingestion/sync, SMS sending, and contact discovery/review. Cron selects only active explicitly enrolled tenants. Revocation stops new capture/sending; verified SMS opt-outs still persist idempotently and delivery receipts for previous sends still reconcile. Retention cleanup remains active; no contact or history deletion occurs as a side effect of enrollment.
- Isolated migration replay preserves other feature rows and contact/activity/mailbox/SMS counts. Disabled-tenant rehearsal rejects sync/OAuth/send/ingestion/suggestions before work; inbound non-opt-out texts are not stored and STOP remains honored.
- Browser acceptance on the final optimized build passes at 390×844 and 1440×900: desktop My Work/mobile More, Pilot labels and Platform group, platform-admin own-mailbox and SMS fixture setup visibility, reviewed contact save/refresh, same/foreign Support View denial, actual Plan revocation/re-enrollment, hidden disabled-tenant links/account tools, direct URL/OAuth/service denial, preserved Core contact controls, no client errors or horizontal overflow. Screenshots inspected. Platform SMS setup visibility now follows the same existing isAdminRole rule as its backend.
- Synthetic users/sessions and fixture enrollment changes were limited to the existing isolated Neon rehearsal child. The browser script removes its session/deactivates its user and cleans up its own interrupted-run sessions. No temporary users/sessions or provider connections were created in shared TST. Local server stopped after acceptance.

## Shared TST migration receipt

- Verified target: project `dawn-frog-33352119`, branch `br-divine-forest-avwq2b3g`, database `neondb`, `neon-neat-tst`.
- Recovery branch `br-morning-glade-avju0g7n` (`pre-communications-pilot-20261012`) is ready at parent LSN `2/9F2AC5B0`.
- Applied/registered only `20261012170000_communications_pilot`; ledger count 50 → 51. SQL is additive entitlement data only, with replay-preserving ON CONFLICT DO NOTHING; no schema change or blanket migrate deploy.
- SHA256 source and ledger match: `0b3ef8edbefcd0f698ae85575c5667a0c7eb583bee0dfd4a42afd28b43a5fe12`.
- Before/after counts: 611 contacts, 2 activities, 0 mailbox connections, 0 SMS connections. Contact identity/name fingerprint `765ae7a9dd00e885e943db9d6038eb43` and other-feature fingerprint `49cb32bf177d9ac51c2e155254abfeff` are unchanged.
- COMMUNICATIONS enabled only for `org_echo_spirits`; disabled for the two other existing organizations. Enrollment source `communications-pilot-v0.2`.

The final chat delivery receipt records the exact staging/tst commit, Vercel READY state and deployed test health. Production baseline `af1f396726e3b15e1167f5af2aa6ba426cae9bf9` remains outside this TST task. The v0.2 release manifest/plan/checklist includes the pilot migration and Echo review gate; this does not mark live-provider acceptance or a frozen production candidate complete. Use the [demo/live review guide](../product/communications-pilot-review.md).
