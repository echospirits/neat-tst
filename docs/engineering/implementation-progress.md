# Extended CRM implementation progress

## Scope and checkpoint

The complete 2026-10-10 sales operating system brief remains **incomplete**. This checkpoint implements the first working communication/activity/deal increment; it is not a frozen release candidate. Branch: `codex/echo-crm-v02`. Base: `5faee9df930bd76b5e56b669f58a57210527f7d5`. Production baseline: `af1f396726e3b15e1167f5af2aa6ba426cae9bf9`, package 0.14.0.

Development version is **0.2.3-dev** because historical v0.2.0, v0.2.1 and v0.2.2 artifacts already exist. The owner-opened 0.2.0 cycle records remain intact. No stable artifact or production tag is replaced.

## Implemented in this increment

- Source audit and permanent architecture/product/design/engineering documentation, root agent guidance and eleven ADRs.
- Extended existing AccountActivity with provider identity, deduplication, private visibility, association confidence, corrections and audit history. Existing physical visits and completed Worklist tasks are projected into the account timeline without copying them.
- Mobile activity entry with known-account context, live account search, optional outcome/direction, completed-time validation and retry idempotency. Separate last contact, meaningful interaction, physical visit and completed follow-up.
- Gmail/Google Calendar and Microsoft Graph metadata adapters; OAuth state/PKCE, encrypted tokens, scope validation, refresh, checkpoints, tombstones, bounded pages, sync leases, disconnect and optional history deletion. Owner-private matching review and a working nonproduction mock connection.
- Tenant-configurable deal stages, nine-stage beverage default, creation, owner/admin progress updates, won/lost/paused/reopen, optimistic concurrency, reason/history, pipeline cards, search and USD weighted estimates. Closed/paused deals are excluded from open forecast.
- Deterministic relationship briefing with explained recency/contact/overdue signals. Canonical contextual follow-up and visit actions retain the account and return path.
- Next.js upgraded to 16.3.8; compatible dependency security fixes applied. Remaining vulnerabilities are explicitly tracked in the security review.
- Unit/provider fixture tests, real PostgreSQL isolation/replay/OAuth-race rehearsal and mobile/desktop browser acceptance scripts.

## Current work / release state

Release gates and exact TST deployment receipt are maintained in [the validation report](../releases/v0.2-test-report.md). New schema was rehearsed on an isolated child of the verified TST database. No shared-TST fixture users or private mailbox authorizations were created. No production mutation is authorized.

## Remaining application work

| Area | Missing scope / next action |
|---|---|
| Communications | Attachments/original-message access, aliases/internal-domain policy, conversation history matching, comprehensive cursor-expiry deletion reconciliation, recurring-calendar occurrence policy, scheduled retry/backoff and disconnected retention sweeper. UI filters currently cover activity type; contact/owner/source predicates exist in the service but date/deal/contact filter UI remains unfinished. |
| Contacts/relationships | Multi-account person graph, authority/influence/preferences, duplicate detection and audited merge. |
| SMS | Twilio/provider abstraction, consent/opt-out ledger, sending identity, signed webhook ingestion, delivery receipts, two-way UI and functional provider fixture. Manual external SMS logging works. No integrated SMS is implemented or sent. |
| Deals | Editing full deal details after creation, reassignment, multiple contacts, activity/task relations, historical forecast/conversion reports and richer board interactions. |
| Health/recommendations | Tenant-configurable health for agencies/restaurants/chains, purchase coverage and last-purchase evidence, multi-signal recommendations/feedback and recovery measurement. Existing Ohio recommendations remain authoritative; the new briefing is not a purchasing-health score. |
| Playbooks | Configurable sequences, idempotent canonical Worklist creation, execution audit and cancellation safeguards. |
| Tenant model | General accounts/parent organizations, multiple memberships/teams, territories, custom fields and generalized non-Ohio account types. |
| Field/territory | Guided account templates, photo categories, offline drafts, geographic assignment and route-provider optimization. Existing visits/photos/maps/scheduling remain functional. |
| Recipes | Costing, pricing assumptions, tenant catalog UI, approved branded sell sheets, shareable pages and printable materials. |
| Events | Event operations, staff scheduling expansion, Eventbrite adapter/mock, costs/attendance/products, configurable observational attribution. |
| AI/reporting | Shared permission-aware provider abstraction, reviewed communication summaries/drafts, expanded outcome KPIs, exports and full requested E2E coverage. |
| Security/release | Remaining dependency findings, broader threat review and capacity tests, credential rotation, live provider acceptance, full frozen candidate checks. |

## External activation gates

- No live Google/Microsoft credentials/consent were assumed. Provider fixtures establish application behavior only. See [setup](integration-setup.md).
- Reported compromised database password must be rotated before production; no rotation is claimed.
- Production approval is absent. Do not merge/push production/main or create a production tag.

## Exact continuation

1. Read this file, [inventory](../product/feature-inventory.md), [validation](../releases/v0.2-test-report.md), [integration setup](integration-setup.md) and canonical UI/release instructions.
2. Fetch TST and reconcile actual refs; preserve unrelated wholesale/security release entries and existing migration-ledger gaps. Use a fresh isolated worktree if the main checkout is dirty.
3. Complete communication operational gaps, then the SMS consent/webhook/mock vertical. Add schema additively and test denial/replay before exposing messaging.
4. Implement contact graph, configurable health and canonical Worklist-backed playbooks; then field/customer tools and reporting/AI. Continue through these areas; documentation alone is not completion.
5. For database/browser regression, create an isolated Neon child and use the guarded scripts described in integration-testing.md. Never print connection strings, session cookies or token contents.
6. Run tests, types, build, responsive acceptance, security review, migration rehearsal and TST deployment verification for each meaningful increment. Select a stable release candidate only after the complete inventory is reconciled.

## Integrated base

Before publication, TST advanced to 3009e9656244c889722073b7519c15b2f23bd5c3. The CRM branch was rebased and concurrent calibration, wholesale purchase pagination and external-link changes were preserved. Integrated regression suite: 808 passing tests.

## Published checkpoint

Application commit `b6d227caf8f707913d43c0ded4ecee2d2da61636` is on staging/tst and its Vercel deployment is READY. Live health confirms test / neon-neat-tst. The receipt-only documentation commit follows it. See the validation report for exact deployment identity. Local acceptance server is stopped; the isolated Neon rehearsal child is retained for reproducibility and may be removed when no longer needed. The main checkout's unrelated local files were preserved.
