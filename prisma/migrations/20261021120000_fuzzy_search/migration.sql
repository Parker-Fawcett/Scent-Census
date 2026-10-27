-- Fuzzy catalogue search.
--
-- The catalogue is 140,000 fragrances and 8,000 houses. Substring matching
-- alone meant a visitor had to type the name exactly, which is not how
-- people search for a scent. pg_trgm gives real typo tolerance, and the
-- GIN indexes make it fast instead of a table scan.
--
-- The indexes are on lower(name) because every query in the search path
-- lowercases before it compares, and a trigram index only helps if the
-- expression matches the indexed expression.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Fragrance_lower_name_trgm_idx"
  ON "Fragrance" USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "House_lower_name_trgm_idx"
  ON "House" USING gin (lower(name) gin_trgm_ops);

-- The house slug is what a house page link is built from, and the search
-- results link to houses.
CREATE INDEX IF NOT EXISTS "Fragrance_houseId_idx" ON "Fragrance"("houseId");
