# Multi-tenant configuration

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Organization, OrganizationFeature, product decisions, supplier identifiers and account overlays already configure tenant behavior. CORE_CRM and advanced intelligence entitlements are distinct. Pipeline stages, communications and scoring settings should add tenant-owned configuration without reopening platform-locked organization fields. Teams, custom roles and broad custom fields are not yet present.

## Implementation references

- `lib/featureRegistry.ts`
- `lib/organizationConfiguration.ts`
- `app/platform/organizations`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.

## Added configuration

Organization admins configure deal stage names, order and probability. Individual mailbox owners configure history/retention/internal-message exclusion and explicit activity visibility. Core CRM entitlement applies throughout; no organization-feature grants are created by reads. Generic custom fields, teams, multiple memberships and health rules remain unimplemented.
