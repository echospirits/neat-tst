import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  validateCustomValues,
  territoryMatches,
  type AccountConfiguration,
} from "../lib/crm/accountConfiguration";
test("custom fields distinguish missing, zero and false values", () => {
  const n = randomUUID(),
    b = randomUUID(),
    config: AccountConfiguration = {
      version: 1,
      territories: [],
      teams: [],
      categories: [],
      fields: [
        { id: n, name: "Capacity", type: "NUMBER" },
        { id: b, name: "Patio", type: "BOOLEAN" },
      ],
    };
  assert.deepEqual(validateCustomValues(config, { [n]: "0", [b]: "false" }), {
    [n]: 0,
    [b]: false,
  });
  assert.deepEqual(validateCustomValues(config, {}), { [n]: null, [b]: null });
  assert.throws(() => validateCustomValues(config, { [n]: "unknown" }));
});
test("territory geographic suggestions require all configured criteria", () => {
  const t = {
    id: randomUUID(),
    name: "Central Ohio",
    states: "OH",
    counties: "Franklin",
    postalCodes: "43215",
    ownerUserId: "",
  };
  assert.equal(
    territoryMatches(t, { state: "OH", county: "Franklin", zip: "43215-1234" }),
    true,
  );
  assert.equal(
    territoryMatches(t, { state: "OH", county: "Delaware", zip: "43015" }),
    false,
  );
  assert.equal(
    territoryMatches(
      { ...t, states: "", counties: "", postalCodes: "" },
      { state: "OH", county: "Franklin", zip: "43215" },
    ),
    false,
  );
});
