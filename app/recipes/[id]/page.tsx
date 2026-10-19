import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmActor } from "../../../lib/crm/auth";
import { prisma } from "../../../lib/prisma";
import { RecipeEditor } from "../RecipeEditor";
import { CrmForm } from "../../components/CrmForm";
import {
  approveRecipeAction,
  shareRecipeAction,
  revokeRecipeShares,
} from "../actions";
export const dynamic = "force-dynamic";
export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor, user } = await requireCrmActor();
  const { id } = await params;
  const recipe = await prisma.recipe.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!recipe) notFound();
  return (
    <>
      <Link href="/recipes">Recipes</Link>
      <h1>{recipe.name}</h1>
      <section className="card">
        <RecipeEditor recipe={recipe} />
      </section>
      <section className="card">
        <h2>Approved customer materials</h2>
        <p>
          Public sheets include the recipe and organization branding. Internal
          costs and account notes are excluded. Links expire after 30 days;
          edits revoke existing links.
        </p>
        {recipe.approvedAt ? (
          <CrmForm
            action={shareRecipeAction}
            submitLabel="Create shareable sheet"
            confirm="Create a public link for this approved recipe? Anyone with the link can view it for 30 days."
          >
            <input name="id" type="hidden" value={id} />
          </CrmForm>
        ) : (
          <p>Awaiting administrator approval.</p>
        )}
        {["ADMIN", "PLATFORM_ADMIN"].includes(user.role) ? (
          <>
            <CrmForm
              action={approveRecipeAction}
              submitLabel="Approve current recipe"
            >
              <input name="id" type="hidden" value={id} />
              <input name="version" type="hidden" value={recipe.version} />
            </CrmForm>
            <CrmForm
              action={revokeRecipeShares}
              submitLabel="Revoke public links"
              confirm="Revoke all public links for this recipe?"
            >
              <input name="id" type="hidden" value={id} />
            </CrmForm>
          </>
        ) : null}
      </section>
    </>
  );
}
