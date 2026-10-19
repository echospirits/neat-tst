# Activity model

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Extend AccountActivity and read legacy visits/tasks/orders as source projections. Preserve initiation vs contact vs visit semantics.

## Alternatives and trade-offs

Bulk copying old events creates duplicate truth and migration risk. A single polymorphic table cannot replace specialized source lifecycles.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
