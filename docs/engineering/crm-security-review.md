# CRM security review — development checkpoint

## Verified controls

- Authenticated server actions derive organization from membership/Support View; private mailbox operations additionally require the user's own membership and reject platform/support mailbox access.
- Timeline reads authorize organization plus TEAM/owner visibility. Existing account initiated-action queries apply the same visibility boundary. Real PostgreSQL fixtures verify private peer and foreign-tenant denial.
- Manual/subscription source keys deduplicate retries; deal changes enforce tenant/owner-or-admin and optimistic version checks. Composite organization keys protect new history/connection/stage relations.
- OAuth state is hashed, expires in ten minutes and is user/provider/organization-bound; PKCE verifier and tokens use the established AES-GCM facility. Scope verification rejects insufficient consent. State is consumed transactionally with connection creation; disconnect deletes pending authorization state. A fixture test demonstrates cancellation while token exchange is in flight.
- Provider requests have 15-second timeouts, deny redirects and use bounded pages. Graph continuation URLs are limited to its HTTPS origin and /v1.0/me/ path. Gmail metadata fetches run in batches of four. No send scope or outbound integration action exists.
- Mail sync uses a ten-minute database lease. The write transaction rechecks connection/membership/lease before committing ingestion, retention and cursor. Operational failures contain safe categories, not provider bodies/tokens.
- Google/Microsoft private/confidential meetings, tombstones and exact internal-only messages are excluded. Imported records default owner-private; corrected associations survive replay.
- No credentials, customer datasets, generated output or session fixtures belong in Git. The ignored rehearsal output contains a short-lived synthetic cookie and must stay private.

## Dependency review

Initial audit: 30 findings (1 critical, 23 high, 5 moderate, 1 low). Next.js was upgraded from 16.2.4 to 16.3.8, then compatible npm audit fixes were applied without force/major downgrades. Clean install reports **20 findings: 0 critical, 17 high, 2 moderate, 1 low**. Audit counts refer to package findings, not independent exploitable paths.

Remaining high chains include Workflow/core integrations (devalue, nanoid, undici) and Prisma configuration/deepmerge-ts. Suggested automatic resolutions include unsupported downgrades of workflow to 2.0.6 or Prisma to 6.12.0; these were not forced. ExcelJS's uuid chain remains moderate. The application still needs a dependency-by-dependency exposure assessment and supported upgrades/overrides with compatibility tests. No claim of a clean vulnerability scan or non-exploitability is made.

Official Next.js release: https://github.com/vercel/next.js/releases/tag/v16.3.8 . The audit and final lockfile are the reproducible inputs; local full JSON is not a public artifact.

## Remaining production gates

- Rotate the database credential reported compromised in the brief; verify all consumers after rotation. This task has not rotated production credentials.
- Complete provider consent/verification, real test-account OAuth/refresh/pagination/deletion acceptance and organizational privacy review before enabling live mailbox reads.
- Add durable adaptive retries/rate limits, cleanup of expired OAuth rows, independent retention enforcement for disabled connections and full deletion reconciliation after cursor expiry.
- Verify high-volume sync fairness/capacity and recurring-calendar semantics. Background route is not automatically scheduled.
- Complete broader master-scope security tests, especially SMS signed webhooks/consent and approved public document sharing, before implementing those outbound/public capabilities.
- Freeze/test a complete candidate and obtain separate production approval. This increment is TST-only.
