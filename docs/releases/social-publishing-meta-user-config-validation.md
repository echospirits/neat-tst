# Optional Meta user-token configuration route

Date: November 12, 2026. Scope: owner-authorized TST compatibility support for a Facebook Login for Business **User access token** configuration. No jobs/live-control changes, public posts, system-user integration, other-provider changes, migrations or dependency changes.

## Current official evidence

Meta's [Facebook Login for Business documentation](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business), updated October 15, 2026, distinguishes user configurations from business-integration system-user configurations. Its user-token/manual-flow sections support an authorization-code grant using `config_id`; omitting `scope` is recommended in configuration mode. A configuration selects token type, assets and permissions, so its numeric ID alone does not establish compatibility or granted access.

The [manual authorization/code-exchange guide](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow) retains the standard client ID, exact callback, code response and separate state. The explicit `override_default_response_type` instruction is in the system-user JavaScript SDK example, not an extra requirement documented for this manual user route. The [long-lived-token guide](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived), updated June 30, 2026, still documents server-side `fb_exchange_token` for a valid user token. A `bearer` label is not a user-versus-system-user type attestation.

Public primary pages were read in a separate browser research session after direct web fetches were rate-limited. The research session made no Meta app, consent or configuration changes. Public protocol evidence is distinct from the actual app dashboard's selections and grants.

## Implementation boundary

- With no nonblank `SOCIAL_META_CONFIG_ID`, the existing scope-based Meta user login remains unchanged.
- With an ID, require 1–100 decimal digits and explicit `SOCIAL_META_TOKEN_TYPE=USER`, set only after verifying the matching configuration's actual User access token choice. The application does not infer this choice from the ID or create/expand the configuration.
- Configuration mode sends `config_id`, omits `scope`, and retains client ID, callback, `response_type=code` and the independent random OAuth state. Existing user-code exchange, long-lived exchange, `/me`, permission checks and Page-linked discovery remain in use. Discovered destination metadata distinguishes this login route.
- Invalid, missing, unknown or system-user selection is visible in setup readiness and blocked before state creation, state lookup/consumption or direct token requests. Another provider remains usable when Meta configuration is blocked.
- OAuth state remains bound to the original tenant, administrator, provider and exact login session, with expiry and one-use checks. The configuration ID never substitutes for state. There is no system-user fallback or claim of runtime token-type introspection.

## Verification and remaining owner evidence

`npm run test:focus -- tests/socialPublishingOAuth.test.ts tests/socialPublishingConfig.test.ts tests/socialPublishingProviders.test.ts` passes **32 tests**, zero failures/skips. Fixtures cover both legacy/configured code exchanges and original-session state guards; malformed IDs and unknown/system-user settings make zero state/provider requests; callbacks and other providers retain their existing behavior. No actual Meta API request or publication occurs in these tests.

Strict `npm run typecheck`: **passed** against the completed source change. The completed full suite passes **1,446 tests / 79 suites**, zero failures/skips, and the optimized build passes. Independent source review found no blocking issue with state/session preservation, fail-closed configuration, legacy compatibility or other-provider isolation. Final TST deployment and actual app permission/configuration creation, secret entry, consent and read-only account discovery are separate owner setup/delivery checks. Server and tenant live publishing remain off.
