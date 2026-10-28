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

## Increment 2: customer-console retirement and Echo administration

Owner confirmed account creation and selected **Make them Echo-admin tools** for OHLQ imports, shared account edits/merges and Account Research. Live readback confirms joe@echospirits.com is active, password configured, role ADMIN, organization org_echo_spirits. No password/session credential was read and no temporary shared-TST test session was created.

- Baseline: staging/tst `7803950f22f908605d9f4da220f5ac0876bf3a72`; origin/main remains `e05e4e86bd5816c420462319c36b638bfc97571e`.
- Delete app/platform pages/actions, Support View routes, provisioning service and obsolete customer-onboarding UI. Retain persisted organizations, roles, provisioning/audit history and every business record; no schema migration or ownership rewrite.
- Preserve ProductSelectionEditor under Echo Settings. Add state and Vendor ID actions that authorize Echo admins and derive organization context on the server. States validate a nonempty supported set and audit before/after without editing features. Vendor IDs are normalized/validated and upserted by Echo/market/ID; a failed discovery reports saved configuration with discovery pending. Existing selling-location, product, connection and workflow settings remain.
- Approved shared maintenance entry points use requireEchoAdmin/requireEchoAdminSession; unrelated admin guards and private Support permissions are not broadened. CSV imports check role, membership and destination; shared merges recheck current role/active/membership in their write transaction and preserve each organization's private-row ownership. User/taster/anonymous and foreign-company cases are rejected before side effects. Existing OHLQ/calendar/cron side-effect policies remain unchanged.
- Navigation no longer links to the customer platform. Home paths do not send legacy Echo platform-role users to a removed dashboard. Echo Settings is available in mobile More and desktop Administration. Forecast access no longer lists/enumerates companies and always verifies Echo membership plus current pilot entitlement, including legacy platform roles.
- Broad automated permission replacement and a routable preview were rejected by automatic review. Used explicitly enumerated approved maintenance paths and a non-routable static localhost component preview instead. No rejected script was executed and no preview app route was added.
- No operational TST/production data/configuration writes in this increment. Remaining legacy Support/activity role branches, background dispatchers, old seed scripts and final table/role cleanup are separate follow-ups. A complete Echo-only production candidate is not yet claimed.

Validation: **917 passing tests / 76 suites**, zero failures/skips/cancellations; optimized Next.js build and whitespace checks pass. The reduced test count reflects removal of tests for deleted customer onboarding/global access, replaced with Echo administration and retired-route checks. TypeScript is checked against freshly generated route types; the initial check referenced stale validators for deleted routes until the fresh build regenerated them.

The actual data actions and maintenance guards are fixture-tested for Echo admin success, ordinary user/taster/anonymous denial, forged organization/role fields, current merge authority, unchanged private-row ownership, state before/after audit, normalized vendor upsert and saved-configuration/discovery-failure handling. The actual manual OHLQ route is executed with fixtures: foreign-company admins and non-admin roles stop before parsing/side effects; Echo admins still respect the disabled environment gate. No import/provider request is sent.

Non-routable static previews reuse the real navigation, EchoDataSettings, StateAccessPicker and ProductSelectionEditor with application CSS at **390 x 844** and **1440 x 900**. Passed mobile More/desktop Administration, absence of platform links, admin Account Research discovery, state live search/empty validation, mocked pending/disabled/success feedback, vendor progressive disclosure, preserved product transfers/search and empty settings. No horizontal page overflow; both screenshots were visually inspected. Preview-only React/Next adapters and save/pending responses are mocked, not a live authenticated application test; a form-action warning belongs to that React 18 fixture. The initial standalone root wrapper offset was corrected before the successful checks. No preview app route exists or ships.

React review: reuse shared controls/styles, no new dependency or polling, private writes authorize server-side and derive ownership, server actions preserve atomic audit/configuration writes, and optional fields stay behind disclosure. Node 24.15.0 / npm 11.12.1 local runtime; dependencies and version remain unchanged. Publication is titled **Retire customer onboarding and keep Echo administration**; exact commit, matching tested tree, READY deployment and TST health are recorded with delivery.

Increment 2 recovery can restore the prior TST application at `7803950f` without a schema/data rollback; that retains increment 1's Echo-only login boundary. Later state/vendor changes remain ordinary compatible organization configuration. No automatic outside-access reactivation or record reassignment is part of this delivery.
