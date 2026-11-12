# Social-only origin setup correction

Date: November 12, 2026. Scope: owner-authorized TST setup follow-up for Facebook/Instagram, with automatic live publishing kept off. Existing `0.10.0-dev` scope and unrelated TST work remain preserved. No production promotion.

## Behavior

The existing application base can reference a legacy deployment alias used by another integration. Social Publishing now accepts an optional `SOCIAL_BASE_URL` so its signed-in setup and provider callbacks can use the current canonical deployment without changing `APP_BASE_URL`, legacy aliases or Calendar configuration.

The selected nonblank value is `SOCIAL_BASE_URL`, then an explicit caller fallback where supplied, then `APP_BASE_URL`. The helper validates an absolute URL, rejects embedded credentials, control characters and backslashes, and returns its normalized origin. HTTPS is required; HTTP is accepted only for exact localhost/IPv4/IPv6 loopback in development. A malformed nonempty override does not silently fall back. OAuth routes return a configuration error before consuming state or contacting a provider when the Social base is invalid.

Provider setup/configuration, authorization-code exchange, OAuth success/error return redirects and scoped dispatch media URL generation share this selection. Provider paths remain unchanged. OAuth state still uses its original tenant, administrator, provider, exact login session, expiry and one-use checks; no cookie or authentication behavior changes.

## TST owner configuration

- Set only `SOCIAL_BASE_URL=https://neat-tst.vercel.app` in the intended TST environment. Preserve the existing application base, aliases and Calendar settings.
- Sign in at `https://neat-tst.vercel.app` before starting Social account consent. The override does not transfer a session cookie from another hostname.
- Register the exact Meta callback `https://neat-tst.vercel.app/api/social/oauth/meta/callback`. Google and LinkedIn retain `/api/social/oauth/google/callback` and `/api/social/oauth/linkedin/callback` on the same selected origin.
- Keep server and tenant live-publishing controls off while enrolling the authorized tester and verifying account discovery. Configuration/enrollment/discovery are separate from publication authorization.

## Validation

- Focused configuration, OAuth, media and provider fixtures: **31 passing tests**, zero failures/skips. Command: `npm run test:focus -- tests/socialPublishingConfig.test.ts tests/socialPublishingOAuth.test.ts tests/socialPublishingMedia.test.ts tests/socialPublishingProviders.test.ts`.
- New coverage verifies canonical override versus the actual legacy TST application origin, explicit/default fallback behavior, malformed/insecure-origin rejection, development-only loopback, unchanged callback paths and scoped media signatures. The mocked Meta callback exchange uses the canonical redirect URI while original-session and one-use state guards remain enforced. No provider network request or live publication occurs in these tests.
- Strict `npm run typecheck`: **passed** against the completed code change.
- Completed full suite: **1,441 passing tests / 79 suites**, zero failures/skips. Optimized build passed. The initial sandboxed build could not traverse Workflow scanner parent directories; the identical build passed outside that filesystem sandbox.
- TST application `6c6eaff2` is READY; canonical health reports connected/test/neon-neat-tst. Joe's actual signed-in TST session shows the enabled pilot, paused tenant live control and simulated mode. Setup displays the canonical Meta callback; Setup/Connections pass 390×844 and 1440×900 overflow/readiness checks. [Deployment/enrollment receipt](social-publishing-meta-enrollment.md). Real Meta discovery and publication are unverified while app creation/credentials/consent remain pending.
- No dependency, schema or migration change; no credentials, hosted settings, aliases or Calendar configuration were changed by this source correction.
