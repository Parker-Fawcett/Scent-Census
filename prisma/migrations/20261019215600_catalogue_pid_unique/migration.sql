-- The FragDB pid is the release-diff identity (PRD 7.7); two catalogue rows
-- with the same pid would be two identities for one record.
CREATE UNIQUE INDEX "Fragrance_catalogueSourcePid_key" ON "Fragrance"("catalogueSourcePid");
