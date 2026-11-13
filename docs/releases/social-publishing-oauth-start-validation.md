# Social OAuth start diagnostics and scoped transactions

November 12, 2026. Owner-authorized TST correction after the actual Meta authorization start returned the generic configuration-required status. This record covers application source and local fixtures. It does not establish the hosted failure's cause or successful real account consent/discovery.

## Behavior

Social connection readiness checks `CALENDAR_TOKEN_ENCRYPTION_KEY` against the existing encryption facility's requirement: at least 32 characters after trimming. Readiness returns only the missing variable's name. OAuth start uses the same condition and a typed setup code before creating state. An existing nonblank but short key no longer appears ready merely because the environment variable exists. No key value is read through tools, logged, replaced or rotated by this correction; existing encrypted Calendar records/settings remain intact.

OAuth start's diagnostic contains exactly `{event: 'social_oauth_start_failed', code}`. Codes are an exact five-character `P` plus four digits, one of `oauth_not_configured`, `oauth_encryption_key_invalid`, `meta_config_id_invalid`, `meta_config_user_type_required`, or `unexpected`. The classifier reads an own data property without invoking getters or serialization hooks. It never logs the original exception, message, stack, URL, provider body, user/tenant/session, state or token. Callback responses retain their generic status handling.

Source inspection identified an additional plausible failure: a Social state write can be the first operation to resolve the account-state policy. Resolving through the base client after an interactive transaction has reserved a connection can reenter a constrained pool. This is an inference, pending hosted evidence. The callers now use the existing organization scope loader before opening that transaction. The callback keeps the same explicit policy context through state consumption, external token/discovery requests, and every later credential/destination persistence transaction. External requests remain outside database transactions. No shared account-state policy or bypass is added.

Existing tenant/admin/tester checks still run inside domain operations. Original session/provider binding, one-use consumption, expiry, denied consent handling, token exchange and independent Facebook/Instagram discovery remain unchanged.

## Local validation

`npm run test:focus -- tests/socialPublishingOAuthFlow.test.ts tests/socialPublishingOAuthDiagnostics.test.ts tests/socialPublishingOAuth.test.ts tests/socialPublishingConfig.test.ts tests/socialPublishingProviders.test.ts tests/accountStateAccess.test.ts` passes **50 tests**, zero failures/skips. Strict `npm run typecheck` passes.

- The caller fixture uses the real existing account-state extension and organization scope loader with a single-slot fake pool. Its control fails with `P2028` when scope resolution begins after the transaction holds the connection. Correct callers load scope first, complete state consumption and encrypted credential/destination persistence, and make zero base-client reads while a transaction is held.
- Wrong-session callbacks make zero provider requests and retain state. Denied consent consumes state once; replay remains rejected. Configured and legacy authorization-code flows retain their original state behavior.
- Missing, blank and whitespace-padded short crypto fixtures block readiness and state writes; a padded valid 32-character fixture remains accepted. Only variable names appear in readiness.
- Malicious arbitrary codes, suffixes/newlines, exception text, URLs, inherited properties, getters, proxies and serialization hooks cannot add private content to diagnostic output. Exact Prisma/setup codes remain observable.

Completed full suite: **1,453 tests / 79 suites passed**, zero failures/skips. Optimized build passed. Independent review approved the scoped context, preserved authorization/session guards, crypto-readiness check and allowlisted diagnostic output. These remain fixture requests with synthetic credentials, not Meta API verification. Actual TST deployment, hosted start, code/state callback and discovered account identity remain acceptance gates. Server and tenant live publishing are unchanged.
