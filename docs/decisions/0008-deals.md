# Deal pipeline

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Add a tenant-owned Deal aggregate; retain SalesOpportunity for detected recommendations and account sales status for relationship state.

## Alternatives and trade-offs

Repurposing SalesOpportunity would couple manually managed revenue deals to detector expiry and auto-resolution. Separate names protect existing behavior.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
