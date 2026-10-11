import test from "node:test";
import assert from "node:assert/strict";
import { recipeCosts } from "../lib/crm/recipeCosting";
test("recipe costs retain unknown inputs and distinguish zero cost", () => {
  assert.equal(recipeCosts({}).cost, null);
  assert.equal(
    recipeCosts({ lines: [{ name: "Spirit", cost: null }] }).cost,
    null,
  );
  assert.equal(
    recipeCosts({ lines: [{ name: "Donated sample", cost: 0 }] }).cost,
    0,
  );
});
test("batch portions, waste, margin and price assumptions are explicit", () => {
  const c = recipeCosts({
    lines: [
      { name: "Spirit", cost: 20 },
      { name: "Mixers", cost: 10 },
    ],
    portions: 10,
    wastePercent: 10,
    menuPrice: 12,
    targetMargin: 75,
  });
  assert.equal(c.cost, 3.3);
  assert.equal(c.margin, 72.5);
  assert.equal(c.suggestedPrice, 13.2);
  assert.equal(
    recipeCosts({ lines: [{ name: "Spirit", cost: -1 }] }).cost,
    null,
  );
});
