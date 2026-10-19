# Developer setup

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Use a clean worktree, npm ci, prisma generate, npm run typecheck, npm test and npm run build. Copy only environment variable names from .env.example and supply local secrets privately. Use APP_ENV=development and disable side effects by default. Never copy a production database URL into a test fixture.

## Implementation references

- `package.json`
- `.env.example`
- `tests/setup.ts`
- `docs/environment-isolation.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
