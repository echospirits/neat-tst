# Mailbox providers

Date: 2026-10-10. Status: accepted implementation direction, except explicitly proposed items.

## Context

Extend the existing multi-tenant Neat application without changing the meaning of established records or authorizing production.

## Decision

Separate mailbox authorization from existing calendar OAuth; normalize Gmail/Graph changes through a common adapter. Default to private metadata and explicit sharing.

## Alternatives and trade-offs

Reusing calendar tokens does not grant mail consent. Reading all message bodies by default adds privacy and provider-verification burden.

## Validation

Track executable coverage and remaining implementation in [progress](../engineering/implementation-progress.md) and [test report](../releases/v0.2-test-report.md).
