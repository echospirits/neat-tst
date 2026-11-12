# Production Supplies — TST validation and activation

Production Supplies **0.10.0-dev** is enabled for Echo in TST following the owner's explicit November 12 activation approval. The initial verified application is `21440ab9c4453de9f40882d2af865fb4e58290e5`, exactly matching local tested tree `d18caecea761c2f41f5c13b07222369ed35ae141`. The follow-up delivery adds complete reviewed-invoice reconciliation, visible warning quantities/thresholds and exact owner-only Gmail source links. Production remains separately released 0.9.2; no main promotion or release tag is authorized.

## Completed implementation

Normalized tenant-owned catalog/rules, needs/warnings/allocations, orders/lines, shipments/contents/arrival history, receipts, source references, audit, mailbox synchronization and notifications support the shared workspace. Existing organization teams identify Production membership separately from role, operational permissions and mailbox consent. The tenant pilot remains disabled by default globally and excluded from broad TST auto-enablement; only Echo is explicitly enrolled.

Dedicated read-only Gmail OAuth/backfill, supported PDF/image extraction, reconciliation and background queues do not restore Communications. EasyPost supplies the live-capable standalone parcel adapter, authenticated webhooks and bounded polling; test/live keys are separated. No supplier message, purchase, accounting entry, inventory-ledger transaction, paid subscription or tracker registration was created.

## Validation

- Completed follow-up local full suite: **1,345 tests / 76 suites**, all pass, no failures, skips or cancellations. The prior delivery had 1,341 passing tests; four additional display/provenance and callback checks cover the live-content corrections.
- Strict TypeScript and optimized Next.js build pass. Local Node 24.15.0/npm 11.12.1 match the deployed Node 24 runtime family. The initial exact-commit [Node 22 clean-install check](https://github.com/echospirits/neat-tst/actions/runs/43233184545) passed.
- **20 persisted workflow scenarios** pass on isolated branch `br-wispy-snow-avmfg588`, target `supplies-rehearsal`, including the 15 requested categories, newest-first replay, conflicting destinations, warning resolution/replay and tenant boundaries. Provider observations are synthetic.
- **Seven additional persisted review checks** pass in `scripts/production-supplies-review-rehearsal.ts`: owner/tenant denial, all validated mixed-invoice lines, exact distinct vendor codes, replay idempotency, manual corrections, older evidence and retained extraction warnings. The original 20 scenarios pass again after sharing the line reconciler.
- **20 browser checks** pass at 390 × 844 and 1440 × 900 with synthetic authenticated fixtures and zero browser errors. Four specifically verify receipt-draft/submission-key preservation and reset. Independent screenshot/React reviews pass; the mobile optional receipt fields were disclosed progressively. Impeccable's mechanical detector returned `[]`.
- Current original-workspace and delivery UI/UX guidelines are byte-identical. Existing shared tokens/components/navigation are preserved. Local acceptance servers and browser test processes are stopped.

Local ignored receipts include `output/production-supplies-oauth-final-tests.log`, `output/production-supplies-oauth-final-build.log`, database rehearsal results and browser acceptance JSON. QA session files, real operational snapshots and all secret-input files must never be committed or published. No raw email bodies or attachment bytes were saved to Git.

## Migration and hosted activation

Applied only `20261112010000_production_supplies` to verified TST project `dawn-frog-33352119`, branch `br-divine-forest-avwq2b3g`, database `neondb`, after isolated rehearsal. It creates 19 normalized tables, composite tenant relations, indexes and quantity/date checks. Normalized-LF SQL checksum and the shared ledger match exactly:

`22228bae276adc7f8ca839bdc20b354c45291799f1a824d049e845c54d2b2daf`

The target/checksum-guarded driver applied no unrelated migrations or ledger reconciliation and deleted no existing data. Echo setup enabled the pilot, created/reused the Production team, assigned uniquely resolved Joe Bidinger and saved the known Raisins/Spiced Rum association with unknown unit/pack size and shared-purpose review. Joe retains Admin role. Karl and Nikhil have no matching existing TST user records, including checks against addresses actually observed in a business thread; no addresses were invented and no accounts were created.

Nine approved supply-only Vercel variables were saved to the explicitly verified `neat-tst` project `prj_fNOruLSh6BQNVXAThXYJEjBw2HYA`, team `team_iONC2HcvO7u5Nt0k3haV3gLS`: dedicated Google client pair, OAuth environment, token-encryption key, mail/job enable switches, dedicated job bearer secret and disabled/false tracking switches. Existing OpenAI credentials are reused; a read-only model metadata probe confirms the configured model is available, without sending email or generating output. This does not verify live extraction quality.

Activation deployment `dpl_4pUqoH8UcTmNDRcZFBSrmQYcLLQi` is READY at application `21440ab9`, loading the new variables. Deployment-specific, canonical and configured legacy base-URL health return HTTP 200 /test /neon-neat-tst /connected. The earlier initial deployment was `dpl_2RVtHBoNxKxdnWHojQCmHnacDC3y`.

Signed-in shared-TST acceptance used Joe's existing legitimate Admin session, with no impersonation or fabricated session. Dashboard/settings show the enabled feature, Production membership, separate permissions and connection state. The follow-up content correction exposes reported stock/thresholds without inventing a required order quantity; owned Google connector sources retain proper original-message links.

## Background execution

Read-only plan inspection verified Vercel Hobby. Its [current cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) allow daily native execution, so the feature has a daily `13 14 * * *` fallback plus a gated GitHub Actions 15-minute trigger at minutes 8/23/38/53. The repository's default branch is verified as `tst`; no subscription upgrade was made.

The dedicated matching job secret was saved in GitHub environment `test`, and repository variable `PRODUCTION_SUPPLIES_SCHEDULE_ENABLED=true` was saved. Global cron remains disabled; the explicit supply-only switch affects this worker only. A direct authenticated invocation returned HTTP 200, one organization, zero mailbox checks/errors and no tracking registrations. The [single GitHub dispatch 43238682678](https://github.com/echospirits/neat-tst/actions/runs/43238682678) executed its refresh job successfully at the exact initial application; total duration 9 s. This verifies the secret and fixed endpoint together. GitHub scheduled jobs can be delayed; persisted queues/checkpoints and freshness remain authoritative.

## Authorized initial business evidence

A narrow 90-day inspection through Joe's already connected business Gmail connector verified identity against the existing Neat user. This is distinct from autonomous Neat mailbox authorization. Eight bounded operational snapshots were imported through the normal authorized domain service, retaining source IDs/times and a documented canonical-fact hash; no raw bodies or attachment bytes were stored. One additional source-labeled public UPS snapshot was recorded.

Shared TST now contains **three order candidates, two supply needs, five shipment references and two unresolved source-review cases**. Required replenishment quantities remain unknown where warnings provide only reported stock/thresholds. No needs were resolved, no receipts were recorded and no inventory conversions were inferred.

The source cases deliberately retain a mixed supplier invoice whose relationship to a one-line confirmation is unproven, and an unconfirmed freight arrangement/quote. Different raw SKU identifiers are preserved; supplier/date/material similarity does not merge the invoice. Partial PDF extraction remains visible. Reviewed attachment now applies all validated lines to the explicitly selected order while preserving manual corrections, chronology and incomplete-extraction warnings.

Actual delivery methods include UPS parcels, GFS supplier delivery and freight without a confirmed carrier/PRO/BOL. A permitted one-time official UPS page check returned Label Created and **no ETA** until the package reaches UPS. Service level and billed date were not converted to an arrival estimate. That result is a manual observation; it is not EasyPost or continuous automated tracking verification.

## Remaining provider gates and safety record

**Neat Gmail connection is blocked by Google's 401 `deleted_client`: the reused OAuth client has been deleted.** No Neat Gmail consent/token was obtained and autonomous mailbox connections remain zero. A valid existing Google OAuth web client or approved replacement is needed, with the exact supply callback on the configured TST base URL. Only Joe's own verified business account may be connected; Karl/Nikhil require actual user setup and their own consent. Replacement-client setup was explicitly approved. The owner completed Google business-account verification and the existing EchoCRM project was verified. Dedicated TST client configuration and Joe’s read-only consent are in progress; credentials are never requested in chat.

Continuous carrier API updates require an approved EasyPost account/key, any carrier-specific access and explicit fee approval before live mode. Tracking remains disabled. No paid registration or new account was created. Freight/supplier delivery automation needs an additional permitted integration; the current source evidence is preserved without treating invoice numbers as tracking identifiers.

Before activation approval, automatic review rejected hosted credential/job changes and a live cron probe. Those rejected attempts made no changes. The owner subsequently approved TST-only activation, and the scoped migration/settings/job verification above completed. A later attempt to inspect alternate hosted Google credentials after the deleted-client error was rejected as outside the approved credential-reuse scope; it was stopped without a workaround.

Partial/damaged Shared receipts retain unknown departmental coverage until explicitly resolved. Unknown shipment contents remain unallocated. Live Gmail backfill, real AI PDF/OCR quality, continuous carrier API updates and real internal receipt remain unverified. Disable the entitlement or supply switches to stop future processing while retaining evidence.

Production/main remains `e2a19c9b45c7bbcbccdbbbf061879a00a43b7718`. Historical refs and the original workspace's unrelated edits are preserved.