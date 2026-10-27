-- PartnerLink.clicks was in the schema but never in a migration
-- (20261021040000_partners added clicks to CreatorPickup instead), so the
-- click route's counter write failed on any database built from migrations.
-- Guarded, so it is a no-op where the column was added by hand.

ALTER TABLE "PartnerLink" ADD COLUMN IF NOT EXISTS "clicks" INTEGER NOT NULL DEFAULT 0;
