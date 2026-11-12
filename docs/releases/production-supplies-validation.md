# Production Supplies — TST validation

Owner request: November 11, 2026. Development version **0.10.0-dev**. Starting TST `0d9a17dd`; starting production `e2a19c9b45c7bbcbccdbbbf061879a00a43b7718` (0.9.2). Work is isolated in `codex/production-supplies`, preserving the original checkout and its unrelated modifications. No main push, production release or release tag is authorized.

## Implementation and activation boundaries

The feature includes normalized persistent records, tenant/manager guards, existing-team membership, read-only Gmail OAuth, mailbox backfill/incremental ingestion, multimodal PDF/image extraction, source/review reconciliation, catalog/rules, orders/needs/shipments/receipts, live-capable EasyPost adapter, signed webhooks, bounded scheduled queues, settings and responsive UI.

Code delivery and hosted activation are separate. The default-disabled `PRODUCTION_SUPPLIES` tenant entitlement is excluded from broad TST auto-enablement. Live tracking additionally requires an account/key and explicit fee approval. No subscription, shipping label, paid tracker registration, supplier message, purchase, accounting write or inventory transaction was created.

## Actual authorized account inspection

Read-only inspection used Neon project `dawn-frog-33352119` (`neat-crm-tst`), branch `br-divine-forest-avwq2b3g`, database `neondb`. Echo had **zero mailbox connections** and no configured teams. Joe Bidinger resolved uniquely to existing active Admin `c6db2100fe5a7517b73f56712`. Karl Dick and Nikhil Sharoff did not resolve by the inspected name/email-substring searches; no addresses or duplicate accounts were invented. **No initial mailbox scan ran and no actual orders, suppliers, shipments or carrier mix were discovered.** No real external tracking lookup was possible without a connected mailbox/reference and approved provider credentials.

The Vercel connector denied environment metadata access (403). The existing CLI fallback succeeded for the explicitly verified team/project: `team_iONC2HcvO7u5Nt0k3haV3gLS` / `prj_fNOruLSh6BQNVXAThXYJEjBw2HYA` / `neat-tst`. Existing Google/OpenAI/cron variable names were inspected without printing secret values. Supply tracking credentials were absent. TST's global cron flag is disabled; the feature therefore offers an explicit `SUPPLY_JOBS_ENABLED` switch that affects only this job. Supply-specific OAuth environment/client settings preserve Calendar's existing configuration.

Automatic approval review rejected adding the prepared supply-only hosted variables, reusing the existing local Google client secret in TST, and enabling mailbox ingestion/jobs. Its stated reason was that repository instructions prohibit hosted configuration changes without explicit authorization. **Those hosted variables were not written.** The rejected action was not retried through a different route. Hosted activation remains an explicit approval/setup step; all independent implementation and validation proceeded.

## Isolated database rehearsal

Created `br-wispy-snow-avmfg588` / `codex-production-supplies-20261111` from TST, with verified target label `supplies-rehearsal` and disabled external effects. Applied only `20261112010000_production_supplies` through the explicit-target, direct-connection, checksum-guarded driver. Normalized-LF SQL checksum:

`22228bae276adc7f8ca839bdc20b354c45291799f1a824d049e845c54d2b2daf`

The SQL adds 19 normalized tables, composite tenant relations, indexes and quantity/date checks. No historical ledger reconciliation or existing data deletion occurred. Shared-TST migration and Echo configuration remain pending hosted activation approval.

`scripts/production-supplies-rehearsal.ts` passed **20 persisted scenarios** with synthetic organization/users/mailbox evidence and normalized tracking observations. Coverage includes all 15 requested workflow categories plus newest-first source replay, conflicting destinations, repeated no-reference purchases on different dates, damaged replenishment returning to ordering, warning replay after resolution and owner-only unresolved-source review. Duplicate confirmations retain multiple sources; shipments from a third inbox reconcile; mixed GFS lines and shared-purpose uncertainty are preserved. Tests also cover partial/multiple shipments, original promises, newer ETA corrections, outage retention, bounded allocations, receipt idempotency, return-to-sender and tenant boundaries.

Provider observations in this rehearsal are **synthetic**. They verify the real persistence/worker path, not live EasyPost or mailbox access. `output/production-supplies-rehearsal-results.json` contains the local sanitized scenario receipt; the separate QA session file is ignored and must not be committed or published.

## Interface verification

Authenticated local acceptance at **390 × 844** and **1440 × 900** passed **16 browser checks**, zero browser errors, using synthetic Echo QA users on the isolated target. Checks include anonymous redirect, incoming/review/detail/empty/settings states, dark theme, return context, viewer restrictions, manual order/need saves, invalid receipt value retention and persisted partial receipt.

Independent screenshot review covered desktop/mobile incoming and details, receipt error and settings. One material improvement was applied: optional shortage/damage/line notes are progressively disclosed, keeping ordinary phone receipt short. The confirmation pass resolves that finding. Impeccable's mechanical detector returned `[]`; the established shared tokens, components and navigation conventions were preserved.

The React source review identified and corrected a receipt draft remount hazard. The dedicated client receipt wrapper retains its draft/submission key through unrelated revalidation and rotates the key only for an explicit subsequent receipt. Four targeted browser checks verify draft preservation, key preservation, successful draft replacement and a blank subsequent receipt with a new key.

## Automated validation and delivery

- Completed code full suite: **1,341 tests / 76 suites**, all pass, no failures/skips/cancellations. The exact delivery test log is retained locally as `output/production-supplies-delivery-tests.log`.
- Strict TypeScript gate and optimized Next.js build pass on completed code, including the final dedicated job authentication and Hobby-compatible scheduling. Log: `output/production-supplies-delivery-build.log`.
- Affected access/domain/mail/tracking/job-auth/jobs/display/navigation checks passed during implementation; final full-suite results include all of them.
- No dependency upgrades; package/lock metadata advance only to `0.10.0-dev`.

### Final local closeout

- Database rehearsal: **20 persisted scenarios**. Interface acceptance: **20 browser checks**, including the four dedicated receipt-state checks; zero browser errors. The mechanical design detector reports no findings and independent screenshot/React reviews pass at their stated scope.
- Local acceptance server and browser processes are stopped. No live provider request or shared-TST mailbox/data mutation occurred.
- Read-only Vercel plan inspection found **Hobby**. The invalid 15-minute native cron was replaced with a daily fallback and a gated GitHub Actions 15-minute trigger; the TST repository default is verified as `tst`. The job requires an approved dedicated secret and repository enable switch, with optional deployment-protection credential. No plan upgrade or new subscription was made.

## Required activation and remaining limits

Approve the TST-only migration/configuration and Echo setup, then register the exact supply Gmail callback for the existing Google client. The prepared callback is `https://neat-tst-joe-1533s-projects.vercel.app/api/production-supplies/mail/google/callback`, matching the currently configured TST `APP_BASE_URL`; the canonical project domain is also `neat-tst.vercel.app`. Each person must authorize their own verified mailbox. Resolve Karl/Nikhil through existing user administration when their actual account details are available.

Tracking requires an approved EasyPost account and environment-specific key; standalone parcel/carrier access and per-registration fees must be confirmed before enabling live mode. Carrier choice is provisional because no actual incoming shipment data was available. Freight PRO/BOL and supplier/GFS delivery references are supported as distinct stored types, but automated external lookup for them requires an additional permitted integration. No portal access was bypassed. See [provider evaluation/setup](../production-supplies-tracking.md).

Unknown shipment contents remain unallocated. Partial/damaged Shared receipts cannot establish departmental receipt allocation, so linked need coverage stays unknown until explicitly resolved. No unit conversion or stock balance is inferred. At most ten attachment parts per message and 8 MiB per attachment are processed; unsupported/excess data requires review. Extraction quality/model access, real OAuth consent, live PDF/OCR quality, signed shared-TST UI acceptance and real tracking behavior remain unverified.

Recovery disables the tenant feature and supply-only server switches while retaining records. Existing production and unrelated TST pilots remain outside this feature's activation.
