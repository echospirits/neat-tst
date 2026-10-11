# Database design

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Organization is the tenant boundary. Agency and WholesaleAccount are shared directories. OrganizationAccountOverlay holds tenant assignment and relationship state. LocationContact, LoggedVisit, WorklistItem, Recipe and derived intelligence are tenant-owned. Account is a legacy model and is not a replacement for current directory identities. AccountActivity currently records initiated communication; the implementation extends it without changing visit semantics.

## Implementation references

- `prisma/schema.prisma`
- `docs/multi-tenant-architecture.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Implemented extension

AccountActivity now has nullable contact, visibility, source identity, participants and provider/matching metadata. MailboxConnection and MailboxOAuthState separate mail authorization from the existing Worklist calendar integration. ActivityAudit records association/visibility corrections. DealStage, Deal and DealEvent implement tenant-owned pursuit history with optimistic versions. Tenant composite keys cover new mailbox/activity, stage/deal and history relations. See [migration runbook](../engineering/crm-migration-runbook.md) for backwards-compatibility and recovery limits.
