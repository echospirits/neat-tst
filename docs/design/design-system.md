# Design system

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

The canonical standard is docs/UI-UX-GUIDELINES.md. Use PageHeader, SectionHeading, EmptyState, existing cards/buttons and semantic CSS variables. Reuse existing forms and navigation patterns. Do not add a competing component framework for new CRM modules.

## Implementation references

- `app/components/PageChrome.tsx`
- `app/styles.css`
- `docs/UI-UX-GUIDELINES.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
