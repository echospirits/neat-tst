# Security and privacy

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Private correspondence must be owner-only unless the owner explicitly shares it. Encrypt provider refresh/access tokens at rest and never include credentials, raw provider failures or message bodies in logs. Validate external callback state, tenant scope and webhook signatures. Uploaded content must respect existing size/type checks. The supplied brief reports a previously exposed database password: credential rotation remains a production activation gate and has not been performed by this implementation.

## Implementation references

- `lib/calendar/crypto.ts`
- `lib/visitPhotoUploadShared.ts`
- `app/api/visit-photos/upload/route.ts`
- `docs/environment-isolation.md`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Current review

The new mailbox controls, OAuth cancellation regression, visibility boundaries, dependency findings and production gates are recorded in [CRM security review](../engineering/crm-security-review.md). Fixture acceptance is not provider verification or a clean security certification.
