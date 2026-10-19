# Release identity

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Historical v0.2.0, v0.2.1 and v0.2.2 exist. Use 0.2.3-dev for this extended implementation and reserve stable 0.2.3 until candidate gates pass.

## Alternatives and trade-offs

Overwriting immutable 0.2 artifacts is prohibited. This patch-lineage choice follows the request for a v0.2 candidate despite current production 0.14.0; it does not claim semantic ordering above 0.14.0.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
