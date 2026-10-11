# Recipes and sales enablement

Audit baseline: TST `5faee9df930bd76b5e56b669f58a57210527f7d5`, inspected 2026-10-10.

Recipe stores tenant ingredients, preparation, instructions, garnish, glassware, flavor and season; RecipeSuggestion links recipes to wholesale accounts. The schema alone does not establish a finished recipe browsing/publishing product. Costing, branded sell sheets and public sharing require implementation and separate access rules.

## Implementation references

- `prisma/schema.prisma`
- `scripts/import-recipes.ts`

## Validation and remaining work

See [implementation progress](../engineering/implementation-progress.md), [feature inventory](../product/feature-inventory.md), and [test report](../releases/v0.2-test-report.md). Existing behavior above is source-audited; it is not a claim of fresh live verification. Changes must update this document and the inventory.
