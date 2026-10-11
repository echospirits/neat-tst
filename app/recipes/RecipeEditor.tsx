"use client";
import { useState } from "react";
import { CrmForm } from "../components/CrmForm";
import { recipeCosts } from "../../lib/crm/recipeCosting";
import { saveRecipeAction } from "./actions";
type Values = {
  id?: string;
  version: number;
  name: string;
  primarySpirit: string | null;
  recipeText: string;
  instructions: string;
  garnish: string | null;
  glassware: string | null;
  flavorProfile: string | null;
  season: string | null;
  sourceAttribution: string | null;
  costing: unknown;
};
export function RecipeEditor({ recipe }: { recipe?: Values }) {
  const initial = recipeCosts(recipe?.costing),
    [lines, setLines] = useState(initial.lines),
    [price, setPrice] = useState(String(initial.menuPrice ?? "")),
    [target, setTarget] = useState(String(initial.targetMargin ?? "")),
    [waste, setWaste] = useState(initial.wastePercent),
    [portions, setPortions] = useState(initial.portions);
  const totals = recipeCosts({
    lines,
    menuPrice: price,
    targetMargin: target,
    wastePercent: waste,
    portions,
  });
  return (
    <CrmForm action={saveRecipeAction} submitLabel="Save recipe">
      <input name="id" type="hidden" value={recipe?.id ?? ""} />
      <input name="version" type="hidden" value={recipe?.version ?? 0} />
      <label>
        Name
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={recipe?.name}
        />
      </label>
      <label>
        Primary spirit / product
        <input
          name="primarySpirit"
          maxLength={200}
          defaultValue={recipe?.primarySpirit ?? ""}
        />
      </label>
      <label>
        Ingredients
        <textarea
          name="recipeText"
          required
          maxLength={6000}
          defaultValue={recipe?.recipeText}
          placeholder="One ingredient and quantity per line"
        />
      </label>
      <label>
        Preparation instructions
        <textarea
          name="instructions"
          maxLength={6000}
          defaultValue={recipe?.instructions}
        />
      </label>
      <div className="form-grid">
        {(
          [
            "garnish",
            "glassware",
            "flavorProfile",
            "season",
            "sourceAttribution",
          ] as const
        ).map((name) => (
          <label key={name}>
            {
              {
                garnish: "Garnish",
                glassware: "Glassware",
                flavorProfile: "Flavor profile",
                season: "Season",
                sourceAttribution: "Source / attribution",
              }[name]
            }
            <input
              name={name}
              maxLength={
                name === "sourceAttribution"
                  ? 500
                  : name === "season"
                    ? 100
                    : name === "glassware"
                      ? 200
                      : 300
              }
              defaultValue={recipe?.[name] ?? ""}
            />
          </label>
        ))}
      </div>
      <details>
        <summary>Cost and menu price assumptions</summary>
        <p className="field-note">
          USD ingredient costs for the complete batch. Include garnish and
          mixers. Blank costs remain unknown. This estimate excludes labor, tax,
          overhead, and service charges.
        </p>
        {lines.map((line, i) => (
          <div className="form-grid" key={i}>
            <label>
              Ingredient / cost item
              <input
                name="costName"
                value={line.name}
                required
                maxLength={160}
                onChange={(e) =>
                  setLines(
                    lines.map((l, j) =>
                      i === j ? { ...l, name: e.target.value } : l,
                    ),
                  )
                }
              />
            </label>
            <label>
              Batch cost (USD)
              <input
                name="costValue"
                type="number"
                min={0}
                max={100000}
                step="0.01"
                value={line.cost ?? ""}
                onChange={(e) =>
                  setLines(
                    lines.map((l, j) =>
                      i === j
                        ? {
                            ...l,
                            cost:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : l,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              Remove cost item {i + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={lines.length >= 40}
          onClick={() => setLines([...lines, { name: "", cost: null }])}
        >
          Add cost item
        </button>
        <div className="form-grid">
          <label>
            Servings per batch
            <input
              name="portions"
              type="number"
              min={1}
              max={10000}
              value={portions}
              onChange={(e) => setPortions(Number(e.target.value))}
            />
          </label>
          <label>
            Waste allowance (%)
            <input
              name="wastePercent"
              type="number"
              min={0}
              max={100}
              value={waste}
              onChange={(e) => setWaste(Number(e.target.value))}
            />
          </label>
          <label>
            Menu price (USD)
            <input
              name="menuPrice"
              type="number"
              min={0}
              max={100000}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            Target gross margin (%)
            <input
              name="targetMargin"
              type="number"
              min={0}
              max={99}
              step="0.1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        </div>
        <p aria-live="polite">
          Cost per serving:{" "}
          {totals.cost === null ? "Unknown" : `$${totals.cost.toFixed(2)}`} ·
          Estimated margin:{" "}
          {totals.margin === null ? "Unknown" : `${totals.margin.toFixed(1)}%`}{" "}
          · Suggested price:{" "}
          {totals.suggestedPrice === null
            ? "Unknown"
            : `$${totals.suggestedPrice.toFixed(2)}`}
        </p>
      </details>
    </CrmForm>
  );
}
