"use client";
import { useState } from "react";
import Link from "next/link";
export function RecipeSearch({
  recipes,
}: {
  recipes: Array<{
    id: string;
    name: string;
    primarySpirit: string | null;
    season: string | null;
    flavorProfile: string | null;
    approvedAt: string | null;
  }>;
}) {
  const [q, setQ] = useState("");
  const found = recipes.filter((r) =>
    [r.name, r.primarySpirit, r.season, r.flavorProfile]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase().trim()),
  );
  return (
    <>
      <label>
        Find a recipe
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, spirit, flavor, or season"
        />
      </label>
      <p aria-live="polite">{found.length} recipes</p>
      <div className="platform-grid">
        {found.map((r) => (
          <article className="card" key={r.id}>
            <h2>
              <Link href={`/recipes/${r.id}`}>{r.name}</Link>
            </h2>
            <p>
              {[r.primarySpirit, r.flavorProfile, r.season]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <span className="pill">
              {r.approvedAt ? "Approved for sharing" : "Draft"}
            </span>
          </article>
        ))}
      </div>
    </>
  );
}
