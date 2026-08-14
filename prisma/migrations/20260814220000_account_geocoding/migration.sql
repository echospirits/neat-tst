CREATE TYPE "GeocodeStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

ALTER TABLE "Agency"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "geocodedAt" TIMESTAMP(3),
ADD COLUMN "geocodeStatus" "GeocodeStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "normalizedGeocodeAddress" TEXT,
ADD COLUMN "geocodeError" TEXT;

ALTER TABLE "WholesaleAccount"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "geocodedAt" TIMESTAMP(3),
ADD COLUMN "geocodeStatus" "GeocodeStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "normalizedGeocodeAddress" TEXT,
ADD COLUMN "geocodeError" TEXT;

CREATE INDEX "Agency_latitude_longitude_idx" ON "Agency"("latitude", "longitude");
CREATE INDEX "Agency_geocodeStatus_idx" ON "Agency"("geocodeStatus");
CREATE INDEX "WholesaleAccount_latitude_longitude_idx" ON "WholesaleAccount"("latitude", "longitude");
CREATE INDEX "WholesaleAccount_geocodeStatus_idx" ON "WholesaleAccount"("geocodeStatus");

