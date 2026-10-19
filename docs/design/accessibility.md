# Accessibility

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Use labels, headings, fieldsets, visible focus and native buttons/links. Announce save errors and success. Frequent touch targets must be at least 44 CSS pixels. Status needs text as well as color. Dialogs need focus management and keyboard escape. Automated layout checks complement manual keyboard review.

## Implementation references

- `docs/UI-UX-GUIDELINES.md`
- `app/styles.css`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## CRM validation

New forms have explicit labels, native disclosure, pending disabled fieldsets, status/alert feedback and preserved text after error. Live account lookup uses buttons with visible result/loading/error text. Responsive acceptance checks four routes at 390×844 and 1440×900 with zero horizontal page overflow. A complete screen-reader/keyboard audit remains a release-hardening task; viewport screenshots alone do not prove accessibility conformance.
