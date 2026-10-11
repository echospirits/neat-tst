# Authentication and authorization

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Sessions use opaque random tokens with only hashes stored in UserSession. Cookies are HTTP-only and same-site. requireUser and requireOrganizationContext guard server pages/actions; APIs must reject unauthenticated callers. Roles are PLATFORM_ADMIN, ADMIN, USER and TASTER. Password recovery has generic acknowledgement and deferred delivery. Server-side role checks remain required even when UI hides controls.

## Implementation references

- `lib/auth.ts`
- `lib/passwordReset.ts`
- `app/api/auth`
- `tests/passwordReset.test.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
