# Authentication and authorization

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Sessions use opaque random tokens with only hashes stored in UserSession. Cookies are HTTP-only and same-site. requireUser and requireOrganizationContext guard server pages/actions; APIs must reject unauthenticated callers. Roles are PLATFORM_ADMIN, ADMIN, USER and TASTER. Password recovery has generic acknowledgement and deferred delivery. Server-side role checks remain required even when UI hides controls.

## Echo-only transition — October 28, 2026 (TST)

Interactive access now requires `User.organizationId = org_echo_spirits`. Neither an Echo email address nor the PLATFORM_ADMIN role bypasses membership. New sessions require an active Echo user; existing sessions recheck current active status and membership on every authenticated read. The account-state Prisma extension applies the same filter and no longer honors Support View cookies. Organization context always resolves Echo and retains its active/status checks.

Invitation display and acceptance are Echo-scoped; acceptance rechecks membership in its transaction. Password reset issuance and completion also recheck Echo membership before writes, preserving generic deferred recovery acknowledgements, row-lock cooldowns and single-use tokens. Outside users and existing records are retained, but cannot enter through these flows.

The owner-requested TST account `joe@echospirits.com` is an Echo `ADMIN`, with a one-time password setup invitation and no platform-wide role. No password or setup token belongs in source, release documentation or logs. See [transition scope and validation](../releases/echo-only-transition-validation.md).

## Implementation references

October 28 increment 4 removes the global Support surface entirely and restricts every User Activity query, including legacy PLATFORM_ADMIN callers, to Echo. Administration navigation requires organization-admin context; old standalone platform guard exports and bootstrap helpers are removed. A retained database role value is not global authority. No membership/role migration or broad grant is performed. Recipes and public recipe shares are retired, eliminating their anonymous application entry point. Existing private correspondence and assignment rules remain intact.

October 28 TST increment 2 retires the customer console and its Support View endpoints. Approved shared-maintenance tools use `requireEchoAdmin` / `requireEchoAdminSession`, requiring both admin authority and Echo membership. General user/taster roles remain restricted. Production Forecasting also requires Echo membership for every role and rejects foreign explicit targets before imports; no platform-role feature bypass remains there. Other private Support permissions are unchanged in this bounded increment.

- `lib/auth.ts`
- `lib/echoAccess.ts`
- `lib/passwordReset.ts`
- `app/api/auth`
- `tests/passwordReset.test.ts`
- `tests/echoOnlyAccess.test.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
