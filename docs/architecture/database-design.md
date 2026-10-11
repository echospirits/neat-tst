# Database design

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Organization is the tenant boundary. Agency and WholesaleAccount are shared directories. OrganizationAccountOverlay holds tenant assignment and relationship state. LocationContact, LoggedVisit, WorklistItem, Recipe and derived intelligence are tenant-owned. Account is a legacy model and is not a replacement for current directory identities. AccountActivity currently records initiated communication; the implementation extends it without changing visit semantics.

## Implementation references

- `prisma/schema.prisma`
- `docs/multi-tenant-architecture.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Implemented extension

AccountActivity carries private/provider metadata and contacts; LoggedVisit continues to own physical visits. OrganizationAccountOverlay gains versioned salesPlan and crmDetails JSON, preserving canonical sales status/assignment. Organization.crmPreferences contains bounded validated tenant settings.

MailboxConnection/OAuthState/ActivityAudit support private ingestion. SmsConnection/Consent/ConsentEvent/Message support tenant messaging. SalesPlaybook/PlaybookRun create existing Worklist tasks. RecipeShare stores token hashes and approved public snapshots; EventShift gains explicit nullable tenant ownership and EventbriteConnection holds encrypted read authorization. Existing unowned event rows are not guessed into an organization.

Composite organization keys protect new relations. Explicit service validation remains necessary for shared directory references and existing legacy relations. New scalar metadata does not redefine authorization. Dormant Deal/DealStage/DealEvent tables from the superseded checkpoint are preserved but have no active workflow. See the migration runbook for exact additive migrations and rollback limits.
