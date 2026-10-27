/**
 * Re-derive the accord tags and note names with the right filter for each.
 *
 * The corpus stores, for every scent, up to eight accord tags and a set of
 * notes, each with a prominence score. The first ingest kept every note, so
 * Tuscan Leather carried jasmine at a weight of zero, which means nobody
 * voted that note at all.
 *
 * The accord list is a family summary, not a pyramid. It is kept whole
 * (zero-strength rows dropped), because a relative floor deleted seven of
 * Imagination's eight families and left the page with "citrus" only.
 *
 * This reads the corpus and rewrites:
 *   - Fragrance.accords   (the accord tags)
 *   - Fragrance.noteNames (the denormalised note list)
 *
 * It is idempotent: running it twice changes nothing the second time.
 *
 *   npx tsx --env-file=.env scripts/fix-prominence.ts
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { filterAccords, filterByProminence } from "../src/domain/prominence";

const CORPUS = "data/kaggle-fragrantica/ledecanteur/perfumes.jsonl";
const BATCH = 300;

const prisma = new PrismaClient();

interface CorpusNote {
  name: string;
  weight: number;
}

interface CorpusRow {
  id: number;
  name: string;
  brand: string;
  people?: number;
  accords?: Array<{ name: string; strength: number }>;
  notes?: {
    tiered?: { top?: CorpusNote[]; middle?: CorpusNote[]; base?: CorpusNote[] };
    flat?: CorpusNote[];
  };
}

const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

const arrayLiteral = (values: string[]): string =>
  values.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${values.map(quote).join(",")}]::text[]`;

async function main(): Promise<void> {
  const rows: Array<{ pid: string; accords: string[]; notes: string[] }> = [];
  let read = 0;
  let accordChanged = 0;
  let noteChanged = 0;
  let withNoNotes = 0;

  const flush = async (): Promise<void> => {
    if (rows.length === 0) return;
    const values = rows
      .map(
        (r) =>
          `(${quote(`fragrantica-${r.pid}`)}, ${arrayLiteral(r.accords)}, ${arrayLiteral(r.notes)})`,
      )
      .join(",");

    const diff = await prisma.$queryRawUnsafe<Array<{ a: number; n: number }>>(
      `SELECT
         COUNT(*) FILTER (WHERE f."accords" IS DISTINCT FROM v.accords)::int AS a,
         COUNT(*) FILTER (WHERE f."noteNames" IS DISTINCT FROM v.notes)::int AS n
       FROM "Fragrance" f
       JOIN (VALUES ${values}) AS v(pid, accords, notes)
         ON f."catalogueSourcePid" = v.pid
       WHERE f."accords" IS DISTINCT FROM v.accords
          OR f."noteNames" IS DISTINCT FROM v.notes`,
    );
    accordChanged += diff[0]?.a ?? 0;
    noteChanged += diff[0]?.n ?? 0;

    await prisma.$executeRawUnsafe(
      `UPDATE "Fragrance" f
       SET "accords" = v.accords, "noteNames" = v.notes
       FROM (VALUES ${values}) AS v(pid, accords, notes)
       WHERE f."catalogueSourcePid" = v.pid
         AND (f."accords" IS DISTINCT FROM v.accords
              OR f."noteNames" IS DISTINCT FROM v.notes)`,
    );
    rows.length = 0;
  };

  for await (const line of stream()) {
    if (line === "") continue;
    read++;
    let row: CorpusRow;
    try {
      row = JSON.parse(line) as CorpusRow;
    } catch {
      continue;
    }
    const notes = row.notes ?? {};
    const flat = notes.flat ?? [];
    const tiered = notes.tiered ?? {};
    const noteTags = flat.length > 0 ? flat : [...(tiered.top ?? []), ...(tiered.middle ?? []), ...(tiered.base ?? [])];

    const accordNames = filterAccords(row.accords ?? []);
    const noteNames = filterByProminence(
      noteTags.map((n) => ({ name: n.name, strength: n.weight })),
    );
    if (noteNames.length === 0) withNoNotes++;

    rows.push({ pid: String(row.id), accords: accordNames, notes: noteNames });
    if (rows.length >= BATCH) await flush();
  }
  await flush();

  const after = await prisma.$queryRawUnsafe<Array<{ a: number; n: number }>>(
    `SELECT
       ROUND(AVG(cardinality(accords)), 2)::float AS a,
       ROUND(AVG(cardinality("noteNames")), 2)::float AS n
     FROM "Fragrance"`,
  );
  console.log(`read ${read.toLocaleString("en-US")} corpus rows`);
  console.log(`  accord tags rewritten: ${accordChanged.toLocaleString("en-US")}`);
  console.log(`  note lists rewritten:  ${noteChanged.toLocaleString("en-US")}`);
  console.log(`  scents with no notes left: ${withNoNotes.toLocaleString("en-US")}`);
  console.log(
    `  now averaging ${after[0]?.a} accords and ${after[0]?.n} notes per fragrance`,
  );
  await prisma.$disconnect();
}

function stream() {
  return createInterface({
    input: createReadStream(CORPUS, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
