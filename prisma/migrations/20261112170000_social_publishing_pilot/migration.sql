-- CreateTable
CREATE TABLE "SocialGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialGroupMember" (
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SocialGroupMember_pkey" PRIMARY KEY ("organizationId","groupId","userId")
);

-- CreateTable
CREATE TABLE "SocialCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authorizationOwnerId" TEXT NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "health" TEXT NOT NULL DEFAULT 'CONNECTED_UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialOAuthState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "verifierEncrypted" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialDestination" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "groupId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "handle" TEXT,
    "profileImageUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "health" TEXT NOT NULL DEFAULT 'CONNECTED_UNVERIFIED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMedia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "mode" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "postUrl" TEXT,
    "detail" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "worklistItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialGroup_organizationId_key_key" ON "SocialGroup"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SocialGroup_organizationId_id_key" ON "SocialGroup"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialCredential_organizationId_id_key" ON "SocialCredential"("organizationId", "id");

-- CreateIndex
CREATE INDEX "SocialOAuthState_expiresAt_idx" ON "SocialOAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDestination_organizationId_provider_externalId_key" ON "SocialDestination"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDestination_organizationId_id_key" ON "SocialDestination"("organizationId", "id");

-- CreateIndex
CREATE INDEX "SocialMedia_organizationId_groupId_createdAt_idx" ON "SocialMedia"("organizationId", "groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMedia_organizationId_id_key" ON "SocialMedia"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMedia_organizationId_storageKey_key" ON "SocialMedia"("organizationId", "storageKey");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_updatedAt_idx" ON "SocialPost"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_organizationId_id_key" ON "SocialPost"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRevision_organizationId_postId_number_key" ON "SocialRevision"("organizationId", "postId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRevision_organizationId_postId_id_key" ON "SocialRevision"("organizationId", "postId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRevision_organizationId_id_key" ON "SocialRevision"("organizationId", "id");

-- CreateIndex
CREATE INDEX "SocialDelivery_status_nextAttemptAt_leaseUntil_idx" ON "SocialDelivery"("status", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "SocialDelivery_organizationId_postId_idx" ON "SocialDelivery"("organizationId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDelivery_organizationId_revisionId_destinationId_key" ON "SocialDelivery"("organizationId", "revisionId", "destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAttempt_deliveryId_number_key" ON "SocialAttempt"("deliveryId", "number");

-- CreateIndex
CREATE INDEX "SocialAudit_organizationId_postId_createdAt_idx" ON "SocialAudit"("organizationId", "postId", "createdAt");

-- AddForeignKey
ALTER TABLE "SocialGroup" ADD CONSTRAINT "SocialGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialGroupMember" ADD CONSTRAINT "SocialGroupMember_organizationId_groupId_fkey" FOREIGN KEY ("organizationId", "groupId") REFERENCES "SocialGroup"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialGroupMember" ADD CONSTRAINT "SocialGroupMember_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialCredential" ADD CONSTRAINT "SocialCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialOAuthState" ADD CONSTRAINT "SocialOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDestination" ADD CONSTRAINT "SocialDestination_organizationId_credentialId_fkey" FOREIGN KEY ("organizationId", "credentialId") REFERENCES "SocialCredential"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDestination" ADD CONSTRAINT "SocialDestination_organizationId_groupId_fkey" FOREIGN KEY ("organizationId", "groupId") REFERENCES "SocialGroup"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMedia" ADD CONSTRAINT "SocialMedia_organizationId_groupId_fkey" FOREIGN KEY ("organizationId", "groupId") REFERENCES "SocialGroup"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_organizationId_groupId_fkey" FOREIGN KEY ("organizationId", "groupId") REFERENCES "SocialGroup"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRevision" ADD CONSTRAINT "SocialRevision_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "SocialPost"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "SocialPost"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_organizationId_postId_revisionId_fkey" FOREIGN KEY ("organizationId", "postId", "revisionId") REFERENCES "SocialRevision"("organizationId", "postId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_organizationId_destinationId_fkey" FOREIGN KEY ("organizationId", "destinationId") REFERENCES "SocialDestination"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAttempt" ADD CONSTRAINT "SocialAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "SocialDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAudit" ADD CONSTRAINT "SocialAudit_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "SocialPost"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
