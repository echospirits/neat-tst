# Account health

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Keep recency, purchasing and commitments separate and explain thresholds. Missing input remains unknown. Implemented with configurable agency/restaurant/chain contact thresholds, purchase recency, contact coverage and overdue Worklist penalties. Missing contact/purchase history prevents a misleading numeric score.

## Alternatives and trade-offs

Communication volume alone is not relationship health. A universal opaque score would hide account-type differences and coverage.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
