# Jobs and retries

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Preserve existing Workflow/cron infrastructure. Mail sync requires database leases and transactional cursor checkpoints.

## Alternatives and trade-offs

A new queue vendor is unnecessary until persisted bounded jobs cannot meet latency/retry requirements. In-memory locks alone cannot protect multiple Vercel instances.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
