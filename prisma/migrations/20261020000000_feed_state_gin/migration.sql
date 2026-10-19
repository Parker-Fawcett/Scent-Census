-- M4: per-user feed page state for the PRD 7.3 back-to-back rule, plus a GIN
-- index on the corpus accords array (the feed pool queries overlap it).
CREATE TABLE "FeedPageState" (
    "userId" TEXT NOT NULL,
    "shownRecently" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPageState_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "FeedPageState" ADD CONSTRAINT "FeedPageState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FeedPageState_updatedAt_idx" ON "FeedPageState"("updatedAt");

CREATE INDEX "Fragrance_accords_gin" ON "Fragrance" USING gin ("accords");
