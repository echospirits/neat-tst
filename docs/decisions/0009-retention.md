# Retention and privacy

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Default imported mail to owner-only. Disconnect stops ingestion and destroys stored tokens; deletion is an explicit owner workflow. Retention must be bounded/configurable before public activation.

## Alternatives and trade-offs

Tenant admin role alone does not grant permission to private employee correspondence. Retaining all body/attachment content indefinitely is unnecessary.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
