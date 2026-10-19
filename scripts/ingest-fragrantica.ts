// M6 free-path catalog load: ingest the full Fragrantica corpus snapshot
// (ledecanteur Kaggle dump, perfumes.jsonl) into the DEV database.
//
//   npx tsx scripts/ingest-fragrantica.ts --file data/kaggle-fragrantica/ledecanteur/perfumes.jsonl
//
// Provenance and honesty notes live in tests/fixtures/fragrantica-dump/SOURCE.md:
// this is a point-in-time community snapshot; nothing here is curated or
// invented. Mapper errors print loudly (a silently skipped famous fragrance
// would be unacceptable) and the run aborts if the error rate stops being
// negligible.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "../src/lib/prisma";
import { applyProvisionalHouseTiers, importDumpRecords } from "../src/server/catalog";
import { mapDumpLine, type MappedDumpFragrance } from "../src/ingest/fragranticaDump";

function parseArgs(): { file: string } {
  const file = process.argv.find((a) => a.startsWith("--file="));
  if (file !== undefined) return { file: file.slice("--file=".length) };
  const flagIdx = process.argv.indexOf("--file");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return { file: process.argv[flagIdx + 1]! };
  console.error("usage: ingest-fragrantica --file <perfumes.jsonl>");
  process.exit(1);
}

const BATCH = 2000;
const MAX_REPORTED_ERRORS = 20;
// corpus rows without any accords/pyramid are legitimately common-ish; a
// structural mapper reject should be rare. 0.5% is the loud/abort line.
const MAX_ERROR_RATE = 0.005;

async function main(): Promise<void> {
  const { file } = parseArgs();

  let seen = 0;
  let mapped = 0;
  let errors = 0;
  const errorSamples: string[] = [];
  let pending: MappedDumpFragrance[] = [];
  const startedAt = Date.now();
  let batchStart = Date.now();

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    const summary = await importDumpRecords(prisma, pending);
    const seconds = ((Date.now() - batchStart) / 1000).toFixed(1);
    console.log(
      `imported batch: +${summary.fragrances} fragrances, ${summary.notes} note rows, ` +
        `${summary.houses} houses, skipped ${summary.skippedAlreadyLoaded} (${seconds}s)`,
    );
    pending = [];
    batchStart = Date.now();
  };

  const stream = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });  for await (const line of stream) {
    if (line.trim() === "") continue;
    seen += 1;
    const result = mapDumpLine(line);
    if (result.record === null) {
      errors += 1;
      if (errorSamples.length < MAX_REPORTED_ERRORS) {
        errorSamples.push(`${result.error?.fid ?? "?"}: ${result.error?.message ?? "?"}`);
      }
      continue;
    }
    mapped += 1;
    pending.push(result.record);
    if (pending.length >= BATCH) {
      await flush();
      if (seen % (BATCH * 10) === 0) {
        console.log(`... ${seen} rows read (${mapped} ok, ${errors} errors)`);
      }
    }
  }
  await flush();

  console.log("error samples (up to 20):");
  for (const sample of errorSamples) console.log(" ", sample);
  const elapsed = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
  console.log(
    `done in ${elapsed} min: ${seen} rows, ${mapped} imported, ${errors} rejected ` +
      `(${((errors / Math.max(seen, 1)) * 100).toFixed(2)}% error rate)`,
  );
  if (seen > 0 && errors / seen > MAX_ERROR_RATE) {
    console.error("ABORTED: error rate above the loud/abort line; inspect before trusting the load");
    process.exit(1);
  }
  await applyProvisionalHouseTiers(prisma);
  console.log("house tier curation applied (PRD 7.6 list in src/server/catalog.ts)");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
