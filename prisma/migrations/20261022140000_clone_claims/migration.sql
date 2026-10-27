-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('HOUSE_DECLARED', 'COMMUNITY_LIST', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('MEASURED', 'UNMEASURED', 'OUTSIDE_CATALOGUE');

-- CreateTable
CREATE TABLE "CloneClaim" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "cloneId" TEXT,
    "productName" TEXT NOT NULL,
    "houseName" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'UNMEASURED',
    "sourceLabel" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "verifiedOn" TIMESTAMP(3) NOT NULL,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "noteMatch" INTEGER,
    "claimedSimilarity" TEXT,
    "priceCents" INTEGER,
    "sizeMl" INTEGER,
    "currency" TEXT,
    "discontinued" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloneClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloneClaim_targetId_houseName_productName_key" ON "CloneClaim"("targetId", "houseName", "productName");

-- CreateIndex
CREATE INDEX "CloneClaim_targetId_status_idx" ON "CloneClaim"("targetId", "status");

-- AddForeignKey
ALTER TABLE "CloneClaim" ADD CONSTRAINT "CloneClaim_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloneClaim" ADD CONSTRAINT "CloneClaim_cloneId_fkey" FOREIGN KEY ("cloneId") REFERENCES "Fragrance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
