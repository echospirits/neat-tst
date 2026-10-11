# Integrated CRM security review

Reviewed 2026-10-11. This is a TST implementation review, not a penetration-test certification or production activation approval.

## Implemented controls

- Server actions derive the tenant from existing authenticated organization context and feature checks. Mailbox/private-capable AI operations reject Support View. New account/event/playbook relationships honor the current tenant state-access extension; signed SMS callbacks enter the connection tenant's state scope only after signature validation.
- Private activity remains owner-only. Timeline, briefing and AI retrieval do not grant administrators a private-mail bypass. AI defaults to TEAM evidence; own private evidence needs per-request opt-in. Reporting excludes private communication entirely.
- OAuth state is hashed, short-lived, PKCE-bound and consumed transactionally. Encrypted tokens use the established AES-GCM facility. Disconnect invalidates pending authorization state. Sync leases recheck membership/connection before atomic ingestion, retention and cursor commit. Cursor URLs cannot forward credentials off-provider.
- Full rescan absence reconciliation runs only after all pages complete and only within its retained scan window. Gmail labels, deleted/private meetings and provider tombstones remove excluded metadata. Retention sweeps also cover disconnected connections. Retry backoff and reconnect classification prevent hot retry loops.
- SMS requires tenant-owned verified sending identity, registration acknowledgment, current recorded consent, environment gates and human send review. Signature validation precedes processing; request bodies are bounded. Phone-scoped locks serialize consent/send claims. Unknown sends are not retried. STOP is processed even on disabled sending connections. Signed callbacks deduplicate and use monotonic delivery updates.
- Playbook tasks use canonical Worklist creation and scoped idempotency. Stop cancels only unchanged, unstarted tasks; completed/edited tasks survive. Account plans/profiles/configuration/events/recipes use versions or locks to reject conflicting updates.
- Public recipe links use random 256-bit tokens stored as hashes, approved snapshots, expiration, noindex/no-referrer and automatic revocation on edit/import. Public snapshots omit internal costs/notes. React escapes content; branding colors and external document links are validated.
- Provider inputs and outputs are bounded. AI has no tools and cannot send/create tasks; unknown source IDs/refusal/incomplete results are rejected. Operational audit avoids prompt/output secrets. AI and route request limits are serialized with advisory locks.
- Fixtures and session credentials are isolated and ignored. No temporary shared-TST admin session, live customer message, production credential write or production deployment is part of acceptance.

## Dependency findings

Initial checkpoint: 30 package findings, including one critical. Next.js 16.3.8 and compatible fixes reduced this to 20. This continuation pins same-major patched `devalue` 5.9.3 and Workflow's `nanoid` 5.1.16, reducing the audit to **6 package findings: 3 high, 2 moderate, 1 low, 0 critical**.

- High: Prisma / @prisma/config / deepmerge-ts share the recursive-object stack-exhaustion advisory. This is the Prisma configuration dependency chain; the app does not deliberately expose Prisma config merging to request JSON. A supported upgrade and adversarial review remain required before declaring the chain resolved. Forcing npm's suggested Prisma downgrade was rejected as a compatibility risk.
- Moderate: ExcelJS / uuid share an optional-output-buffer bounds advisory. ExcelJS is a development import/report dependency. The current app does not claim this advisory is fixed; upgrade compatibility remains a production gate.
- Low: esbuild development server on Windows. The app does not run esbuild's public development server in production. Keep development listeners local and take a supported toolchain patch when available.

Counts are dependency-package findings, not six independent proven exploit paths. These exposure notes are source assessment, not proof of non-exploitability. The final lockfile and refreshed npm audit reproduce the result.

## Activation gates and limits

Live provider authorization, Google verification, messaging carrier registration/consent review, provider retention terms, real-device/network acceptance and production load/capacity tests remain external rollout gates. Rotate any credential identified as compromised before production and verify all consumers; no production credential rotation is claimed here. Preserve tenant flags and select an exact production candidate through the existing release process.
