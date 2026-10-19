CREATE TABLE "CreatorPickup" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "fragranceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'review',
    "url" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorPickup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatorPickup_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatorPickup_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreatorPickup_fragranceId_idx" ON "CreatorPickup"("fragranceId");
CREATE INDEX "CreatorPickup_creatorId_idx" ON "CreatorPickup"("creatorId");
