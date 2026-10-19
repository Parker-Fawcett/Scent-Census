-- CreateEnum
CREATE TYPE "HouseTier" AS ENUM ('DESIGNER', 'NICHE', 'CLONE', 'MASS_MARKET');

-- CreateEnum
CREATE TYPE "NotePosition" AS ENUM ('TOP', 'HEART', 'BASE');

-- CreateEnum
CREATE TYPE "Concentration" AS ENUM ('OIL', 'EDC', 'EDT', 'EDP', 'EXTRAIT', 'OTHER');

-- CreateEnum
CREATE TYPE "VoteDirection" AS ENUM ('LIKE', 'DISLIKE', 'DECLINE', 'OWN');

-- CreateEnum
CREATE TYPE "CensusBucket" AS ENUM ('SPOT_ON', 'CLOSE', 'SIMILAR', 'SAME_FAMILY', 'NOT_CLOSE');

-- CreateEnum
CREATE TYPE "CreatorStatus" AS ENUM ('UNCLAIMED', 'INVITED', 'CLAIMED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('FRAGRANCE', 'HOUSE', 'CREATOR');

-- CreateEnum
CREATE TYPE "UpdateEventType" AS ENUM ('DROP', 'NEW_REVIEW', 'PICKUP', 'CENSUS_MILESTONE', 'WORTH_MOVE', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('EBAY_ASKING', 'RETAIL_FEED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "budgetBand" TEXT,
    "buysClones" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "House" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tier" "HouseTier" NOT NULL,
    "catalogueSourcePid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fragrance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "concentration" "Concentration",
    "year" INTEGER,
    "discontinued" BOOLEAN NOT NULL DEFAULT false,
    "perfumer" TEXT,
    "blindBuyRisk" DOUBLE PRECISION,
    "inspiredById" TEXT,
    "catalogueSourcePid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fragrance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FragranceNote" (
    "fragranceId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "position" "NotePosition" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "FragranceNote_pkey" PRIMARY KEY ("fragranceId","noteId","position")
);

-- CreateTable
CREATE TABLE "CatalogueRequest" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT,
    "name" TEXT NOT NULL,
    "houseGuess" TEXT,
    "sourcePid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogueRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fragranceId" TEXT NOT NULL,
    "sizeMl" INTEGER,
    "batchCode" TEXT,
    "pricePaidCents" INTEGER,
    "purchasedOn" TIMESTAMP(3),
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "userId" TEXT NOT NULL,
    "fragranceId" TEXT NOT NULL,
    "direction" "VoteDirection" NOT NULL,
    "reasonSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("userId","fragranceId")
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" TEXT NOT NULL,
    "fragranceId" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "sizeMl" INTEGER,
    "condition" TEXT,
    "priceCents" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sourceListingId" TEXT,

    CONSTRAINT "PricePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FragranceEstimate" (
    "fragranceId" TEXT NOT NULL,
    "lowCents" INTEGER NOT NULL,
    "midCents" INTEGER NOT NULL,
    "highCents" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "previousLowCents" INTEGER,
    "previousHighCents" INTEGER,
    "previousComputedAt" TIMESTAMP(3),

    CONSTRAINT "FragranceEstimate_pkey" PRIMARY KEY ("fragranceId")
);

-- CreateTable
CREATE TABLE "CloneVote" (
    "userId" TEXT NOT NULL,
    "cloneId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "bucket" "CensusBucket" NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CloneRollup" (
    "id" TEXT NOT NULL,
    "cloneId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CloneRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platforms" JSONB NOT NULL,
    "status" "CreatorStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "claimedById" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "lastSeenRelease" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UpdateEventType" NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceLabel" TEXT NOT NULL,

    CONSTRAINT "UpdateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "House_name_key" ON "House"("name");

-- CreateIndex
CREATE UNIQUE INDEX "House_slug_key" ON "House"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Note_name_key" ON "Note"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Fragrance_slug_key" ON "Fragrance"("slug");

-- CreateIndex
CREATE INDEX "CollectionItem_userId_idx" ON "CollectionItem"("userId");

-- CreateIndex
CREATE INDEX "Vote_fragranceId_idx" ON "Vote"("fragranceId");

-- CreateIndex
CREATE INDEX "PricePoint_fragranceId_capturedAt_idx" ON "PricePoint"("fragranceId", "capturedAt");

-- CreateIndex
CREATE INDEX "CloneVote_cloneId_targetId_idx" ON "CloneVote"("cloneId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CloneVote_userId_cloneId_targetId_key" ON "CloneVote"("userId", "cloneId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CloneRollup_cloneId_targetId_key" ON "CloneRollup"("cloneId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_slug_key" ON "Creator"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_claimedById_key" ON "Creator"("claimedById");

-- CreateIndex
CREATE INDEX "Follow_subjectType_subjectId_idx" ON "Follow"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_userId_subjectType_subjectId_key" ON "Follow"("userId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "UpdateEvent_userId_idx" ON "UpdateEvent"("userId");

-- AddForeignKey
ALTER TABLE "Fragrance" ADD CONSTRAINT "Fragrance_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragrance" ADD CONSTRAINT "Fragrance_inspiredById_fkey" FOREIGN KEY ("inspiredById") REFERENCES "Fragrance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragranceNote" ADD CONSTRAINT "FragranceNote_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragranceNote" ADD CONSTRAINT "FragranceNote_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueRequest" ADD CONSTRAINT "CatalogueRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricePoint" ADD CONSTRAINT "PricePoint_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragranceEstimate" ADD CONSTRAINT "FragranceEstimate_fragranceId_fkey" FOREIGN KEY ("fragranceId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloneVote" ADD CONSTRAINT "CloneVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloneVote" ADD CONSTRAINT "CloneVote_cloneId_fkey" FOREIGN KEY ("cloneId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloneVote" ADD CONSTRAINT "CloneVote_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloneRollup" ADD CONSTRAINT "CloneRollup_cloneId_fkey" FOREIGN KEY ("cloneId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloneRollup" ADD CONSTRAINT "CloneRollup_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Fragrance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateEvent" ADD CONSTRAINT "UpdateEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
