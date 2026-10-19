ALTER TABLE "UpdateEvent" ADD COLUMN "dedupKey" TEXT;

-- collapse concurrent milestone emissions instead of duplicating. Nulls are
-- distinct in Postgres unique indexes, so events without a dedup key are
-- unaffected.
CREATE UNIQUE INDEX "UpdateEvent_userId_type_subjectType_subjectId_dedupKey_key"
  ON "UpdateEvent"("userId", "type", "subjectType", "subjectId", "dedupKey");
