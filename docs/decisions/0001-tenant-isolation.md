# Tenant boundary

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Retain shared Ohio directories and tenant-owned overlays. Resolve tenant on the server and scope every private query.

## Alternatives and trade-offs

Duplicating directories per tenant would break import identifiers; database-per-tenant would add operational complexity. Composite constraints supplement application guards where practical.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
