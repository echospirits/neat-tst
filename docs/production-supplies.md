# Production Supplies

Production Supplies is a tenant pilot in **0.10.0-dev**, developed for TST. It combines open supply needs with orders, shipments, tracking observations and internal receipts. It does not purchase supplies, message suppliers, write accounting entries or change the inventory ledger.

## Where to work

- **Production Supplies** in My Work and mobile More opens `/production-supplies` for authorized users.
- Incoming groups arrivals by today, this week, later and unknown; Needs ordering identifies insufficient or unknown replenishment; Needs attention includes tracking failures, delays, backorders, unknown historical outcomes and deliveries awaiting receipt.
- Review exposes uncertain line classifications and source-processing issues; History retains completed/cancelled orders and resolved needs.
- Open an order for its full line relationship, individual shipments/arrival history, related needs, notes, source references, receipts and audit history. The production dashboard defaults to Production and Shared lines.
- Settings are at `/production-supplies/settings`, also linked from Users. Catalog and reviewed matching rules are at `/production-supplies/catalog`.

Search and filters cover material, supplier, owner, location, status and department. Missing quantities, units, destinations and ETA remain unknown. Historical invoices without outcome evidence are flagged; their invoice dates never become delivery estimates.

## Membership, permissions and consent

Reuse the existing organization account-configuration teams. Administrators choose or create the Production team and edit its members in Production Supplies settings; a person keeps their current application role. Changing the team picker loads that team's current members rather than silently replacing them with another team's list.

Membership controls **future mailbox monitoring**. Separate viewer/manager grants control operational access; administrators retain operational administration. A Production member can authorize their own Gmail mailbox without receiving dashboard permission. Support View never grants mailbox access. Each mailbox owner must connect their own verified Neat email account through read-only Google OAuth.

The tenant entitlement `PRODUCTION_SUPPLIES` defaults disabled. It is excluded from Core/Intelligence packages and TST's broad auto-enablement. Enable it explicitly for pilot tenants. The guarded Echo setup resolves existing active Joe Bidinger, Karl Dick and Nikhil Sharoff records only when each full name resolves uniquely. It does not fabricate addresses, create accounts or change roles. Its configuration grants the resolved people production membership and operational management, separately from their still-required mailbox consent.

Removing a member pauses future ingestion without deleting existing shared orders or evidence. Disabled users, disabled connections, tenant suspension and feature removal stop ingestion. The worker checks again after extraction before publishing a result. The source owner can open the original message; operational access does not expose another person's unrelated mailbox or raw message body.

## Email setup and processing

1. Configure existing or dedicated Google OAuth credentials (`SUPPLY_GOOGLE_CLIENT_ID` / `SUPPLY_GOOGLE_CLIENT_SECRET`, falling back to the existing Google client). Enable the Gmail API and register the exact environment callback: `APP_BASE_URL/api/production-supplies/mail/google/callback`.
2. Configure `SUPPLY_MAIL_TOKEN_ENCRYPTION_KEY` with at least 32 characters and matching `SUPPLY_MAIL_OAUTH_ENVIRONMENT` (or the existing `OAUTH_ENVIRONMENT` when no supply-specific value is set). New supply mailbox tokens use authenticated server-side encryption. Retained tokens using an unsupported retired format require owner reauthorization; calendar-only consent is never reused as Gmail permission.
3. Reuse the existing server-side `OPENAI_API_KEY` and model configuration; `SUPPLY_EXTRACTION_MODEL` defaults to the model already used by Neat's research service. Set `SUPPLY_MAIL_INGESTION_ENABLED=true` only for the intended environment. No new key or subscription is provisioned by this feature.
4. Each production person opens Settings and connects Gmail. Their session, single-use OAuth state, PKCE verifier and verified email bind the authorization to their own account.
5. Configure `CRON_SECRET` through the existing scheduler policy. Enable `SUPPLY_JOBS_ENABLED` for this feature if global `CRON_JOBS_ENABLED` remains disabled; this leaves all unrelated jobs disabled. `/api/cron/production-supplies` has a daily native fallback. The gated GitHub Actions workflow calls it every 15 minutes when explicitly activated, using its dedicated secret. It runs without an open dashboard.

Settings default to 90 days of backfill and a 15-minute polling interval. Discovery uses broad order/invoice/shipment/freight/delivery/low-stock terms across suppliers and, where enabled, sent messages. It excludes spam/trash and never requires forwarding or labels. Fixed Google API requests retrieve message parts and supported PDF, PNG/JPEG/WebP, text and CSV attachments. Unsupported/oversized attachments become visible review issues; PDF/image extraction uses the existing multimodal AI API. Attachments are bounded at 8 MiB each, text at 100,000 characters and attachment lists at ten per message.

Extraction treats content as untrusted data, has no tools or link following, requests a strict schema, validates the result and disables provider response storage. Unrelated personal/consumer correspondence is excluded. Quotes and inquiries never create an ordered purchase. Important facts retain source identifiers, message time, extraction time and audit relationships. Raw mailbox bodies and attachment bytes are not persisted in operational records or logs.

Each mailbox has its own durable checkpoint, history state, lease, last success, next run, retry and processing count. Short bounded batches continue on later runs. Individual malformed sources retry separately before moving to Review, letting later messages and other mailboxes continue. Incremental queries overlap the last success to avoid gaps; source identity and hashes make replays idempotent. Initial backfill does not send historical alerts. Newest-first historical shipping notices can reconcile from stored extracted facts after their older order is discovered, without another AI request.

Distillx5/Five x 5 warnings produce needs keyed by material and location. Repeated unresolved warnings append occurrences and update the latest known warning. Resolved needs retain history; an old replay does not reopen them, and a valid later warning can create a new need. `source` and occurrence records permit a future Ollie adapter without requiring it now. A warning's age/source is displayed; it is not proof of current stock.

## Scheduling on the current hosting plan

The verified TST Vercel team currently uses Hobby. Its [official cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) allow daily execution only; a 15-minute native expression would fail deployment. The code therefore includes a daily `13 14 * * *` fallback and `.github/workflows/production-supplies.yml` on the verified default `tst` branch, scheduled at minutes 8/23/38/53. No subscription change is required by this implementation.

The GitHub job remains disabled until the repository variable `PRODUCTION_SUPPLIES_SCHEDULE_ENABLED=true` is explicitly approved/set. Its `test` environment needs a dedicated `SUPPLY_JOB_SECRET` matching the supply-only server variable; existing global cron credentials are not rotated. If deployment protection applies, an approved `SUPPLY_JOB_VERCEL_BYPASS` credential is also required. The workflow uses a fixed TST URL, refuses redirects, has a six-minute timeout and serializes overlapping executions. GitHub can delay scheduled jobs; per-mailbox checkpoints and freshness indicators remain authoritative. Native and external triggers call the same tenant-gated, bounded worker.

## Classification and replenishment

Rules apply at line level: this-purchase decisions, reviewed supplier+SKU rules, confirmed catalog mappings with known unit/pack constraints, and weaker material/context evidence. Shared-use catalog items require purchase-purpose review. Supplier identity or mailbox owner alone never makes an item Production.

Correct a line, map a catalog item, choose Shared, allocate a known production/bar split, or ignore an irrelevant purchase. **Apply to this purchase** preserves a manual correction across rescans. **Remember for future purchases** creates only the reviewed supplier+SKU mapping; it requires an actual SKU and does not create a broad supplier rule. Catalog/rule editing is explicit and audited.

Echo's initial Raisins catalog association records its Spiced Rum use. It does not invent a GFS SKU, pack size, purchase or departmental quantity. Shared use stays reviewable. Mixed GFS invoices retain all lines and the shared order/shipment while only the production-relevant lines appear in the default view.

A need can link several order lines; a line can replenish several needs. Known allocated quantities are bounded across needs; incompatible units, missing pack sizes or unknown shared allocations never become adequate coverage. Automatic item/location matches create **unknown coverage** until quantities are confirmed. Users can unlink mistakes. Arrival dates shown on needs come from their linked shipment estimates.

The visible stages are Needs order → Ordered → Incoming → Received, with coverage, review, blocked state and explicit resolution separate. Carrier-delivered material awaits internal confirmation. Record actual received quantities, shortage, damage and notes, including zero-received shortage-only events. Partial receipt leaves the rest outstanding. Usable receipt quantities distribute once across allocations; they do not automatically resolve needs or write stock transactions. Resolve an operational need explicitly when satisfied.

## Automated shipment tracking

See [tracking provider evaluation and setup](production-supplies-tracking.md). The implementation uses EasyPost's standalone Tracker API for supported parcel carriers, with provider-specific code behind a small adapter. It registers supplier-purchased shipments without buying a shipping label. Tracking mode is disabled by default; test and live keys are separate, and live registration also requires an explicit fee-approval flag.

Initial/due lookups, authenticated HMAC v2 webhooks, scheduled reconciliation, persisted leases, source-time ordering, bounded Retry-After-aware retries and a five-minute persisted manual-refresh limit protect updates. The dashboard retains the last valid result through failures and labels freshness. Registration IDs are reused. Updates stop or slow after terminal/delivered states; return-to-sender is not receipt at the facility.

Supplier promises, carrier estimates, provider predictions, appointments, manual expectations, actual delivery and internal receipt remain distinct. Date-only values stay calendar-date strings, with local windows/timezones retained when supplied. Current values are chosen by source priority; previous estimates and the original supplier promise remain inspectable. A newer provider correction may move a shipment backward; older events cannot overwrite it. Material ETA slips and exceptions create deduplicated in-app notifications, not email or supplier messages.

Freight PRO, bill-of-lading and supplier order references remain distinct types. No actual shipment/carrier data was available during initial account inspection, so parcel provider selection is provisional. Freight and GFS supplier-delivery automation require a verified permitted integration and credentials; this implementation does not scrape authenticated portals or relabel invoices as tracking references. Their best available supplier/manual expectation remains usable.

## Migration, activation and recovery

`20261112010000_production_supplies` creates normalized tenant-related catalog/rules, orders/lines, shipments/contents, arrival estimates/observations, needs/warnings/allocations, receipts, source links, audit, mailbox synchronization and notifications. Composite tenant foreign keys, indexes and quantity/date checks support integrity. Existing records and migrations remain intact.

Use `scripts/production-supplies-setup.ts` with explicit `--env-file`, `--expected-host` and `--expected-target`. Dry-run first, review the normalized SQL/checksum, rehearse with `--rehearsal` against `supplies-rehearsal`, then pass `--apply --checksum=…` only for that verified target. Shared TST requires `APP_ENV=test`, `DATABASE_ENVIRONMENT=test`, `DATABASE_TARGET_ID=neon-neat-tst` and matching host. The driver uses a direct connection, applies only this migration and refuses unrelated ledger reconciliation. `--echo-setup` additionally enables the Echo pilot and records only the verified configuration described above. No production target is accepted.

Disable the tenant entitlement to hide the feature and stop future jobs. Server-side switches separately stop ingestion or live tracking. Disconnecting one's mailbox clears its stored tokens and retains shared operational records. Do not delete tables as rollback. See [validation and delivery evidence](releases/production-supplies-validation.md) for exactly what was tested and what remains blocked.
