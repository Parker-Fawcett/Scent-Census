-- Ads require a paying partner.
--
-- The ad slots that were in the database were seeded fakes: nobody had
-- signed a deal, nobody was paying, and the pages were serving "Advertisement
-- Lattafa Perfumes" to readers as though it were a real sponsor. The rule
-- from here on is that an ad renders only when a partner is marked as
-- paying for ads.
--
-- The seeded slots are deleted, along with their fake impression counts.

DELETE FROM "AdSlot";

ALTER TABLE "Partner" ADD COLUMN "paysForAds" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AdSlot"
  ADD COLUMN "sponsorPartnerId" TEXT;

CREATE INDEX "AdSlot_sponsorPartnerId_idx" ON "AdSlot"("sponsorPartnerId");

ALTER TABLE "AdSlot"
  ADD CONSTRAINT "AdSlot_sponsorPartnerId_fkey"
  FOREIGN KEY ("sponsorPartnerId") REFERENCES "Partner"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
