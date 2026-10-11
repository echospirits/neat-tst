# AI architecture

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Existing AI assists public account research, voice visit notes and weekly digest narrative. These are bounded feature-specific integrations, not a common conversation agent. Future communication intelligence must receive only records visible to the requesting user, preserve source identifiers and require human review. Deterministic recommendations and manual workflows must remain usable without AI credentials.

## Implementation references

- `lib/accountResearch.ts`
- `lib/voiceVisitNote.ts`
- `lib/weeklyDigestNarrative.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
