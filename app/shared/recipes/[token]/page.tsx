import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/prisma";
import { PrintRecipe } from "./print";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Recipe sheet",
  referrer: "no-referrer" as const,
};
export default async function SharedRecipe({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const share = await prisma.recipeShare.findFirst({
    where: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      organization: { active: true },
    },
  });
  if (!share) notFound();
  const r = share.snapshot as Record<string, string>;
  return (
    <article
      className="card recipe-sheet"
      style={{
        borderTop: `8px solid ${/^#[0-9a-f]{6}$/i.test(r.color) ? r.color : "#2458ff"}`,
      }}
    >
      <p>{r.brand}</p>
      <h1>{r.name}</h1>
      <p>{r.primarySpirit}</p>
      <h2>Ingredients</h2>
      <ul>
        {r.recipeText
          .split("\n")
          .filter(Boolean)
          .map((line, i) => (
            <li key={i}>{line}</li>
          ))}
      </ul>
      <h2>Preparation</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{r.instructions}</p>
      <p>{r.glassware ? `Glassware: ${r.glassware}` : ""}</p>
      <p>{r.garnish ? `Garnish: ${r.garnish}` : ""}</p>
      <p>{r.flavorProfile}</p>
      {r.sourceAttribution ? <p>Source: {r.sourceAttribution}</p> : null}
      <PrintRecipe />
    </article>
  );
}
