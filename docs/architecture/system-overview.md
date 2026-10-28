# System overview

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Next.js App Router renders authenticated server pages and uses server actions and route handlers for mutations. Prisma 6 connects to Neon PostgreSQL. Vercel serves the application; scheduled routes, GitHub Actions OHLQ acquisition and Workflow jobs perform bounded background work. Shared Ohio reference records are separate from tenant-owned customer relationships.

## Implementation references

- `app/layout.tsx`
- `lib/prisma.ts`
- `vercel.json`
- `.github/workflows`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Integrated CRM extension

`lib/crm` supplies domain services for existing Pipeline, Log Visit, Contacts, Worklist, account history and Echo Settings. Support and Recipes are retired in the October 28 Echo-only TST transition; their history remains stored. My Schedule adds event staff scheduling and reviewed route order. No competing Deals or Activities workflow remains.

```mermaid
flowchart LR
  Rep[Authenticated member] --> UI[Existing account / Pipeline / Log Visit / Worklist]
  UI --> Auth[Organization and feature authorization]
  Auth --> Domain[Integrated CRM services]
  Domain --> DB[(Tenant records and shared directory references)]
  Providers[Google / Graph / Twilio / Eventbrite] --> Adapters[Validated bounded adapters]
  Adapters --> Gate[Lease / signature / consent / privacy guards]
  Gate --> DB
  DB --> Review[Authorized briefing and reviewed AI]
  Review --> Human[Human decision in canonical workflow]
```
