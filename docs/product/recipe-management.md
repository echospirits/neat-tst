# Recipes and customer materials

Retired from TST on October 28, 2026 at the owner's request. Catalog/editor, costs/approval, account recommendations, import/sample generation, recipe-photo upload helper and public share pages are removed. Previously issued share URLs no longer resolve in the new application. Recipe, suggestion, photo-reference and share history remains stored; legacy account-merge handling preserves its references. No table, blob or record was deleted. See [transition validation](../releases/echo-only-transition-validation.md#increment-4-module-retirement-and-remaining-administration).

The remainder is historical design evidence, not an available application workflow.

The catalog extends the existing tenant-scoped Recipe and RecipeSuggestion records and existing import path. Search by name, spirit, flavor or season; edit preparation, ingredients, garnish, glassware and attribution. Wholesale account recommendations retain account notes in CRM.

Costing uses explicit USD batch ingredient costs, servings, waste allowance, menu price and target gross margin. Missing line costs remain unknown. Per-serving cost = sum(batch costs) × (1 + waste percentage / 100) / servings. Gross margin = (menu price − cost) / menu price. Suggested price = cost / (1 − target margin / 100). Labor, taxes, overhead and service charges are excluded. No inferred bottle price is represented as a supplier price.

An organization administrator reviews and approves the current recipe version. A representative can then explicitly create a public branded training sheet. It includes preparation and attribution, excludes private costs/account notes, expires after 30 days and can be printed. Editing or importing changes revokes all existing links and resets approval. Administrators can revoke links separately. Public links are random 256-bit capabilities stored only as hashes; expired/revoked/disabled-tenant shares return not found.

Tests cover unknown/zero costs, portions/waste/margins, tenant isolation, approval, safe snapshots, expiry and revocation. Live browser acceptance is recorded in the release report.
