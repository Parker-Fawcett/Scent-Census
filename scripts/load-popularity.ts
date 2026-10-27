// Bulk-load the corpus popularity magnitude and price-perception vote into
// Fragrance.popularityMagnitude and Fragrance.priceValue.
//
// The smell-alike relation in the corpus is SYMMETRIC and carries no
// direction information, so the direction tiebreak uses popularity: the
// original is the fragrance the community actually wears and rates. That
// signal has to be in the database.
//
// This uses a single staging table plus one UPDATE, instead of 140k
// individual updates, because the row-by-row version took 20 minutes.
//
//   npx tsx scripts/load-popularity.ts --file data/kaggle-fragrantica/ledecanteur/perfumes.jsonl

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "../src/lib/prisma";

function parseArgs(): { file: string } {
  const file = process.argv.find((a) => a.startsWith("--file="));
  if (file !== undefined) return { file: file.slice("--file=".length) };
  const flagIdx = process.argv.indexOf("--file");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return { file: process.argv[flagIdx + 1]! };
  console.error("usage: load-popularity --file <perfumes.jsonl>");
  process.exit(1);
}

async function main(): Promise<void> {
  const { file } = parseArgs();
  const started = Date.now();

  const rows: Array<{ pid: string; mag: number; pv: number | null }> = [];
  const stream = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of stream) {
    if (line.trim() === "") continue;
    let d: { id: number; popularity?: { magnitude: number }; price_value?: { average: number } };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const mag = d.popularity?.magnitude;
    if (mag === undefined) continue;
    const pv = typeof d.price_value?.average === "number" && d.price_value.average > 0
      ? d.price_value.average
      : null;
    rows.push({ pid: `fragrantica-${d.id}`, mag: Math.round(mag), pv });
  }
  console.log(`popularity values read: ${rows.length}`);

  // stage into a temp table, then one set-based UPDATE
  await prisma.$executeRawUnsafe(`
    CREATE TEMP TABLE pop_stage (
      pid TEXT PRIMARY KEY,
      mag INTEGER NOT NULL,
      pv DOUBLE PRECISION
    )
  `);

  const CHUNK = 20000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = slice.map((r) => `('${r.pid}',${r.mag},${r.pv === null ? "NULL" : r.pv})`).join(",");
    await prisma.$executeRawUnsafe(
      `INSERT INTO pop_stage (pid, mag, pv) VALUES ${values} ON CONFLICT (pid) DO UPDATE SET mag = EXCLUDED.mag, pv = EXCLUDED.pv`,
    );
    console.log(`  staged ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Fragrance" f
    SET "popularityMagnitude" = s.mag, "priceValue" = s.pv
    FROM pop_stage s
    WHERE f."catalogueSourcePid" = s.pid
  `);
  console.log(`popularity magnitude + price value written to ${updated} fragrances`);

  const withPop = await prisma.fragrance.count({ where: { popularityMagnitude: { not: null } } });
  const withPv = await prisma.fragrance.count({ where: { priceValue: { not: null } } });
  console.log(`rows with popularity now: ${withPop}, with price value: ${withPv}`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
