# Migration strategy

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Add compatible nullable/defaulted columns and new indexed tables. Rehearse, apply only the requested TST migration, then deploy.

## Alternatives and trade-offs

Destructive replacement or db push against shared environments would risk unrelated data and migration history.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
