-- Owner-authorized permanent Social Publishing retirement on shared TST.
-- Run only through the reviewed exact-target retirement driver after rehearsal.
-- Keep historical applied migrations; do not promote this TST-only change to main.
-- No CASCADE: an unexpected reference must stop and roll back the transaction.
DELETE FROM "public"."OrganizationFeature" WHERE "featureKey" = 'SOCIAL_PUBLISHING';

UPDATE "public"."Organization"
SET "crmPreferences" = "crmPreferences" - 'socialPublishing'
WHERE "crmPreferences" ? 'socialPublishing';

DROP TABLE "public"."SocialAttempt";
DROP TABLE "public"."SocialAudit";
DROP TABLE "public"."SocialDelivery";
DROP TABLE "public"."SocialRevision";
DROP TABLE "public"."SocialPost";
DROP TABLE "public"."SocialMedia";
DROP TABLE "public"."SocialDestination";
DROP TABLE "public"."SocialOAuthState";
DROP TABLE "public"."SocialCredential";
DROP TABLE "public"."SocialGroupMember";
DROP TABLE "public"."SocialGroup";
