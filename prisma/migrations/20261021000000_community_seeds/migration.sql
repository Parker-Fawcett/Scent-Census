-- CreateTable
CREATE TABLE "CommunitySeed" (
    "id" TEXT NOT NULL,
    "cloneId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "bucket" "CensusBucket" NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "sampleSize" INTEGER,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "methodology" TEXT NOT NULL,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunitySeed_cloneId_targetId_key" ON "CommunitySeed"("cloneId", "targetId");

-- CreateIndex
CREATE INDEX "CommunitySeed_targetId_idx" ON "CommunitySeed"("targetId");

-- AddForeignKey
ALTER TABLE "CommunitySeed" ADD CONSTRAINT "CommunitySeed_cloneId_fkey" FOREIGN KEY ("cloneId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySeed" ADD CONSTRAINT "CommunitySeed_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
