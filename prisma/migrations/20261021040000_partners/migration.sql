-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'direct',
    "affiliateId" TEXT,
    "baseUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLink" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "fragranceId" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'row',
    "clickId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorPartnership" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sendsTo" TEXT,
    "channelUrl" TEXT,
    "givesCensusPage" BOOLEAN NOT NULL DEFAULT true,
    "revenueShareBps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorPartnership_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PricePoint" ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "CreatorPickup" ADD COLUMN     "creatorVerdictCents" INTEGER,
ADD COLUMN     "creatorVerdictNote" TEXT,
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "clicks" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Partner_slug_key" ON "Partner"("slug");

-- CreateIndex
CREATE INDEX "PricePoint_partnerId_idx" ON "PricePoint"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerLink_fragranceId_idx" ON "PartnerLink"("fragranceId");

-- CreateIndex
CREATE INDEX "PartnerLink_partnerId_idx" ON "PartnerLink"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerLink_partnerId_fragranceId_placement_clickId_key" ON "PartnerLink"("partnerId", "fragranceId", "placement", "clickId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorPartnership_creatorId_platform_key" ON "CreatorPartnership"("creatorId", "platform");

-- AddForeignKey
ALTER TABLE "PartnerLink" ADD CONSTRAINT "PartnerLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLink" ADD CONSTRAINT "PartnerLink_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPartnership" ADD CONSTRAINT "CreatorPartnership_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPickup" ADD CONSTRAINT "CreatorPickup_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
