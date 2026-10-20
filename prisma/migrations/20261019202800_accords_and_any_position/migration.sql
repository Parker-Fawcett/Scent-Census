-- Free-path catalog load (ledecanteur Fragrantica corpus snapshot).
-- Community accords stored on the fragrance; ANY position for untiered
-- community notes. PG16 allows ADD VALUE in a transaction when the value
-- is not used in the same transaction (it is not).
ALTER TABLE "Fragrance" ADD COLUMN "accords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TYPE "NotePosition" ADD VALUE 'ANY';
