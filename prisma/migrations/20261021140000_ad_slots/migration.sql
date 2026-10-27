-- Ad slots.
--
-- Production got this table outside the migration history, so no migration
-- created it and a fresh database could not get past
-- 20261021150000_ads_require_paying_partner. Every statement here is
-- guarded, so on a database that already has the table this is a no-op.
-- sponsorPartnerId is added by the next migration, as it was in production.

CREATE TABLE IF NOT EXISTS "AdSlot" (
    "id" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "ctaUrl" TEXT NOT NULL,
    "sponsorHouseId" TEXT,
    "fragranceId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdSlot_placement_startsAt_idx" ON "AdSlot"("placement", "startsAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdSlot_sponsorHouseId_fkey') THEN
    ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_sponsorHouseId_fkey"
      FOREIGN KEY ("sponsorHouseId") REFERENCES "House"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdSlot_fragranceId_fkey') THEN
    ALTER TABLE "AdSlot" ADD CONSTRAINT "AdSlot_fragranceId_fkey"
      FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
