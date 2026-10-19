// Seeds the DEV catalogue from the committed FragDB 10-record samples.
// This is a development convenience and an E2E fixture source; the real M6
// seed uses the full CSV. Idempotency comes from importCatalogRecords.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { importCatalogRecords } from "../src/server/catalog";
import { mapFragDBCatalog } from "../src/ingest/fragdb";

const SAMPLES = join(__dirname, "../tests/fixtures/fragdb-samples");

async function main(): Promise<void> {
  const catalog = mapFragDBCatalog({
    fragrancesCsv: readFileSync(join(SAMPLES, "fragrances.csv"), "utf8"),
    notesCsv: readFileSync(join(SAMPLES, "notes.csv"), "utf8"),
    accordsCsv: readFileSync(join(SAMPLES, "accords.csv"), "utf8"),
  });
  if (catalog.errors.length > 0) {
    console.error("seed aborted: mapper errors", catalog.errors);
    process.exit(1);
  }
  await importCatalogRecords(prisma, catalog.records);
  console.log(`seeded ${catalog.records.length} catalogue rows`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
