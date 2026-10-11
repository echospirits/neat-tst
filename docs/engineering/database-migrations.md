# Database migrations

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Prefer additive schema changes with compatible defaults and indexes. Preserve all legacy records. Generate/review migration SQL, validate schema, rehearse in a disposable database, then apply only the requested migration to verified TST. Never reset shared databases or silently reconcile unrelated migration drift. Production requires rotation of the reported compromised credential and separate release approval.

## Implementation references

- `prisma/migrations`
- `scripts/prisma-environment-command.ts`
- `docs/environment-isolation.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## CRM migration

Follow the [exact migration runbook](crm-migration-runbook.md). TST legacy activity rows were fingerprinted before/after the additive migration; no new connection/deal row is seeded automatically. Only the named migration is registered; the pre-existing password-reset ledger gap is not repaired.
