# Coding standards

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Use strict TypeScript, Zod input validation and shared domain services. Derive actor and tenant from authenticated server context. Avoid any in new domain code; use typed provider payloads and validate untrusted responses. Keep external fetch injectable for deterministic tests. Do not expose raw exceptions to users.

## Implementation references

- `tsconfig.json`
- `lib/auth.ts`
- `lib/organizations.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
