import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { CrmForm } from "./CrmForm";
import { RecordPicker } from "./RecordPicker";
import { suggestRecipeAction } from "../recipes/actions";
export async function AccountRecipes({
  organizationId,
  accountId,
}: {
  organizationId: string;
  accountId: string;
}) {
  const [recipes, suggestions] = await Promise.all([
    prisma.recipe.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.recipeSuggestion.findMany({
      where: {
        organizationId,
        wholesaleAccountId: accountId,
        recipe: { organizationId },
      },
      include: {
        recipe: { select: { id: true, name: true, primarySpirit: true } },
      },
      orderBy: { suggestedAt: "desc" },
    }),
  ]);
  return (
    <section className="card">
      <details>
        <summary>Recipe recommendations · {suggestions.length}</summary>
        {suggestions.map((s) => (
          <div key={s.id}>
            <Link href={`/recipes/${s.recipe.id}`}>{s.recipe.name}</Link>
            <p>{s.recipe.primarySpirit}</p>
            <p>{s.note}</p>
          </div>
        ))}
        {recipes.length ? (
          <CrmForm action={suggestRecipeAction} submitLabel="Recommend recipe">
            <input type="hidden" name="accountId" value={accountId} />
            <RecordPicker
              name="id"
              label="Recipe"
              allowEmpty={false}
              options={recipes.map((r) => ({ value: r.id, label: r.name }))}
            />
            <label>
              Account notes
              <textarea name="note" maxLength={2000} />
            </label>
          </CrmForm>
        ) : (
          <p>
            <Link href="/recipes">Add a recipe to the catalog</Link> to
            recommend it here.
          </p>
        )}
      </details>
    </section>
  );
}
