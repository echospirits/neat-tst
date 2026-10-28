# Echo-only transition — incremental TST validation

Owner authorization: October 28, 2026, start the rollback in neat-tst one step at a time. The owner explicitly requested a new joe@echospirits.com TST account locked to Echo, rather than changing the old staging account. This scope overrides the earlier development freeze for this transition only; version stays 0.2.3.

## Increment 1: interactive access

- Baseline: staging/tst `9ad65455e7d1e28a2c5060d55d9dd903ee626db0`; production origin/main `e05e4e86bd5816c420462319c36b638bfc97571e`.
- Access requires the authenticated user's existing organization to be `org_echo_spirits`; no email-domain, role or staging-organization exception. Session reads recheck current membership, so retained outside cookies stop authenticating without erasing history. Direct session creation checks active status and membership in its transaction.
- Organization context and the account-state request resolver ignore the former Support View selection. Private-record organization/state filters remain; no outside records are moved into Echo.
- Invitation lookup and transactional claim/activation require Echo membership. Password recovery retains generic deferred acknowledgements and existing cooldown/token behavior; row-lock issuance and completion also recheck membership before mutation.
- Existing platform and provisioning UI, background dispatchers, integrations and public token-based sharing are outside this increment. The new ordinary organization-admin account cannot enter platform administration. Full Echo-only teardown is not yet complete.

## Operational TST account

- Verified Neon project neat-crm-tst (`dawn-frog-33352119`), branch main (`br-divine-forest-avwq2b3g`), database neondb; this is the dedicated TST database, not production.
- Preflight: Echo is active/ACTIVE; joe@echospirits.com did not exist. Existing users were the staging platform administrator and the Middle West test alias.
- Inserted only the owner-requested Echo ADMIN user and a hashed, single-use, 72-hour invitation. Account remains inactive with no password until the owner completes password setup. No old account/session/organization deletion or reassignment, reset email, copied password or new provider credentials.
- Setup token and link are not stored in this record or source. TST's email-side-effect policy is unchanged; the owner receives the setup link directly.

## Validation and delivery

- Full suite: **924 passing tests / 76 suites**, zero failures, skips or cancellations. TypeScript, optimized Next.js production build and `git diff --check` passed in the isolated checkout.
- Actual authentication, login, invitation and reset code runs against local fixtures. Checks cover all four existing roles; old outside cookies; direct session issuance; membership/activation changes; forged role/organization inputs; Echo-only context; the independent account-state resolver; invitation replay/race denial; outside identity privacy; reset completion and row-lock membership races. Existing password-reset cooldown/concurrency/delivery-failure tests remain passing.
- The built local application was browser-checked at **390 x 844** and **1440 x 900**: Echo sign-in copy, generic login rejection, recovery pending/disabled, generic recovery acknowledgement, validation/network failures, unavailable invitation/reset links and password-setup confirmation. No horizontal page overflow; mobile login and desktop invitation screenshots visually reviewed. Login/recovery responses were intercepted locally; no email or shared-TST session was created. The favicon 404 is pre-existing; recovery 400/network errors were injected deliberately.
- React review: server-side authorization remains authoritative, existing shared forms/styles are reused, no new client dependency, event listener or polling. No provider activation, schema migration or global TST entitlement change.
- Live TST readback confirms the new user is an inactive/passwordless Echo ADMIN with one pending invitation. Both old TST accounts remain unchanged in their original organizations and fail the new membership predicate. Human password setup and authenticated use are pending the owner's activation; no live authenticated smoke test is claimed.
- Publication: commit titled **Restrict TST interactive access to Echo Spirits**. Exact SHA, Vercel READY and health target are recorded with the delivery receipt.

## Recovery

No schema rollback is needed. Reverting the access candidate restores the former authentication rules and would therefore restore outside access; review that consequence before any rollback. Original user/session/organization ownership remains intact. The newly requested account and its one-time invitation are the only operational inserts.

## Next increments

1. Remove outside onboarding/provisioning and Support View/platform navigation, retaining Echo administration.
2. Constrain scheduled imports, intelligence, digests, calendars and communications to Echo; stop outside provider processing after reviewing current connections.
3. Review/export outside data and remove obsolete code/schema only after retention and rollback decisions. Preserve Echo workflows and ownership throughout.

Production promotion, outside data deletion, notifications and provider disconnection require their own scope review. This delivery is TST only.
