-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "costing" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "RecipeShare" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeShare_tokenHash_key" ON "RecipeShare"("tokenHash");

-- CreateIndex
CREATE INDEX "RecipeShare_organizationId_recipeId_idx" ON "RecipeShare"("organizationId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_organizationId_id_key" ON "Recipe"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "RecipeShare" ADD CONSTRAINT "RecipeShare_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeShare" ADD CONSTRAINT "RecipeShare_organizationId_recipeId_fkey" FOREIGN KEY ("organizationId", "recipeId") REFERENCES "Recipe"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

