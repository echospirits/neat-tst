# Social OAuth discovery diagnostics

November 12, 2026. Scope: owner-authorized TST observability after real Meta consent completed and the callback returned `access-review-required` with zero destinations. The owner separately inspected enabled grants and selected assets in Business Integrations. Those observations do not establish what each Graph discovery request returned.

## Source findings and minimal correction

The previous completion loop counted provider exceptions but discarded their codes. The final no-destination status did not distinguish empty account lists from discovery failures. Facebook discovery already requests only `id,name,access_token,tasks,picture`; the Instagram-specific field is requested independently. No query/permission change is justified by the zero-destination status alone.

After successful exchange/identity/permissions, `social_oauth_grants` emits only the provider enum, fixed `GRANTS` stage and deduplicated exact known permission names. Each provider emits `social_oauth_discovery` with fixed `DISCOVERY` stage, `FOUND`, `EMPTY` or `FAILED`, an integer count and a safe error code on failure. Completion returns that same sanitized evidence alongside the existing discovery/failure counts. Callback catch emits only `social_oauth_callback_failed`, `CALLBACK` and a safe code.

Codes are exact five-character Prisma codes, a fixed set of local setup/discovery codes, or an entire `http_4xx/5xx` code optionally followed by numeric provider/subcode fields bounded to eight digits each. Unknown values become `unexpected`; suffixes, whitespace, arbitrary text, oversized fields and serialization/accessor hooks cannot enter output. No exception, body, token, state, URL, identity or asset ID is logged. The known Google scope URI is a fixed permission identifier. The diagnostic adds no schema, audit mislabel, unmatched user-token persistence, extra provider request, scope or live-control change. Existing successful/partial discovery and original-session one-use state handling remain intact.

`SocialAudit` requires a post foreign key, and the organization audit enum has no connection-diagnostic action. This narrow correction therefore uses structured server logs and safe return data rather than creating a synthetic post or mislabeling an audit event.

## Primary documentation and limits

Meta documents [`/{user-id}/accounts`](https://developers.facebook.com/docs/graph-api/reference/user/accounts/) as Pages the person owns or can perform tasks on. The canonical [permissions reference](https://developers.facebook.com/documentation/development/permissions) describes `pages_show_list` for listing managed Pages; `pages_read_engagement` depends on it, and `pages_manage_posts` depends on both. The [Manage a Page guide](https://developers.facebook.com/documentation/pages-api/manage-pages) keeps appropriate Page tasks and any business 2FA requirements separate from permission consent.

Those sources do not establish a universal `business_management` dependency for every personal USER-token `/me/accounts` request. The [Page reference](https://developers.facebook.com/docs/graph-api/reference/page/) documents narrower requirements for business system-user tokens and the `business` field, neither of which is this Facebook-only query. The [Instagram Page-field reference](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/page#permissions) describes separate `instagram_business_account` dependencies, including additional ads permission conditions when a Page role was granted through Business Manager; its linked field-specific content is older and should be checked against actual error evidence before expanding access. That field is absent from the Facebook request.

Primary pages were inspected read-only in the research session. No permission was added, no grant expanded and no token/account/provider configuration changed as part of this code correction. Actual safe hosted outcomes should determine the next investigation.

## Validation

`npm run test:focus -- tests/socialPublishingOAuthDiagnostics.test.ts tests/socialPublishingOAuth.test.ts tests/socialPublishingOAuthFlow.test.ts tests/socialPublishingConfig.test.ts tests/socialPublishingProviders.test.ts tests/socialPublishingCrypto.test.ts tests/accountStateAccess.test.ts` passes **58 tests / 1 suite**, zero failures/skips. Strict typecheck passes. Independent read-only security/correctness review approved the runtime change.

Fixtures cover empty versus failed provider discovery, fixed granted-scope filtering/deduplication, strict error-code acceptance/redaction, no credential/destination persistence when zero results, and original-session/expiry/one-use callback behavior. Existing provider fixtures verify Facebook discovery remains usable when Instagram-specific discovery fails. Completed full suite: **1,463 tests / 79 suites passed**, zero failures/skips; optimized build passed. All fixture provider responses are synthetic. Hosted deployment and actual diagnostic readback remain separate release-owner steps; no claim of real account discovery or publishing is made.
