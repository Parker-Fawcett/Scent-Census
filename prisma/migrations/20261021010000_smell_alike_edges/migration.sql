-- AlterTable
ALTER TABLE "InspiredByEdge" ADD COLUMN     "upVotes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "downVotes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'corpus-smell-alike';

-- CreateIndex
CREATE INDEX "InspiredByEdge_upVotes_idx" ON "InspiredByEdge"("upVotes");
