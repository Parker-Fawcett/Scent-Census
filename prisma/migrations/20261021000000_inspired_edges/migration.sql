-- Many-to-many curated clone edges: census coverage beyond the single canon
-- column (inspiredById stays for display and the feed's nature pools).
CREATE TABLE "InspiredByEdge" (
    "cloneId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspiredByEdge_cloneId_fkey" FOREIGN KEY ("cloneId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InspiredByEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InspiredByEdge_cloneId_targetId_key" ON "InspiredByEdge"("cloneId" , "targetId");
CREATE INDEX "InspiredByEdge_targetId_idx" ON "InspiredByEdge"("targetId");
