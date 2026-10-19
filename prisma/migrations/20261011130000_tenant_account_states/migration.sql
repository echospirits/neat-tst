-- Independent of Core CRM / Intelligence entitlements.
ALTER TABLE "Organization" ADD COLUMN "enabledStates" TEXT[] NOT NULL DEFAULT ARRAY['OH']::TEXT[];
UPDATE "Organization" SET "enabledStates" = ARRAY['OH','FL']::TEXT[] WHERE id = 'org_echo_spirits';
