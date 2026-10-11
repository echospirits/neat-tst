# Account detail experience

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

The account is the primary workspace. Preserve notes/contacts then outstanding Worklist, account context and return links. Add communication logging and timeline filtering close to relationship information. Private correspondence must not leak through counts, headings or summaries.

## Implementation references

- `app/components/AccountWorkspaceNavigation.tsx`
- `app/components/AccountWorklist.tsx`
- `app/agencies/[id]/page.tsx`
- `app/wholesale/[id]/page.tsx`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Current implementation

Existing account pages keep contacts, notes, visit history and outstanding Worklist. Activity headings now include contextual Timeline and Deals links. The timeline briefing provides follow-up/visit actions and account return links. The full requested single-page tabbed workspace, purchase briefing, document/event/AI sections remain future work; do not claim this increment completed them.
