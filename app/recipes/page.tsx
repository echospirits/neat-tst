import { requireCrmActor } from "../../lib/crm/auth";
import { prisma } from "../../lib/prisma";
import { PageHeader } from "../components/PageChrome";
import { RecipeEditor } from "./RecipeEditor";
import { RecipeSearch } from "./RecipeSearch";
export const dynamic = "force-dynamic";
export default async function Recipes() {
  const { actor } = await requireCrmActor();
  const rows = await prisma.recipe.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      primarySpirit: true,
      season: true,
      flavorProfile: true,
      approvedAt: true,
    },
  });
  return (
    <>
      <PageHeader
        title="Recipes"
        description="Prepare, cost, and share approved sales and training materials."
      />
      <details className="card">
        <summary>Create recipe</summary>
        <RecipeEditor />
      </details>
      <RecipeSearch
        recipes={rows.map((r) => ({
          ...r,
          approvedAt: r.approvedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
