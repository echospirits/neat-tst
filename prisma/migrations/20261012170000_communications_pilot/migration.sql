-- v0.2 Communications remains a tenant opt-in pilot; enroll only Echo Spirits.
-- Preserve prior explicit choices on replay. No correspondence or contacts change.
BEGIN;
INSERT INTO "OrganizationFeature" ("id", "organizationId", "featureKey", "enabled", "source", "createdAt", "updatedAt")
SELECT 'communications_pilot_' || md5(o."id"), o."id", 'COMMUNICATIONS',
       o."id" = 'org_echo_spirits' AND EXISTS (
         SELECT 1 FROM "OrganizationFeature" f WHERE f."organizationId" = o."id" AND f."featureKey" = 'CORE_CRM' AND f."enabled" = true
       ), 'communications-pilot-v0.2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
ON CONFLICT ("organizationId", "featureKey") DO NOTHING;
COMMIT;
