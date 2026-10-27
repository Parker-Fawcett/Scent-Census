// Capture retail prices.
//
//   npx tsx scripts/capture-retail-prices.ts [--limit=N] [--stale-only]
//
// The logic lives in src/server/priceCapture.ts, which the daily cron route
// also calls, so a price can never come from a path the schedule misses.

import { capturePrices } from "../src/server/priceCapture";
import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  const staleOnly = process.argv.includes("--stale-only");
  const started = Date.now();
  const result = await capturePrices({ onlyStale: staleOnly });
  console.log(
    `sources ${result.sources} · products ${result.products} · matched ${result.matched} · written ${result.written} · skipped fresh ${result.skippedFresh}`,
  );
  if (result.errors.length > 0) {
    console.log(`notes: ${result.errors.join("; ")}`);
  }
  const total = await prisma.pricePoint.count();
  const priced = await prisma.fragrance.count({ where: { pricePoints: { some: {} } } });
  console.log(`price points ${total} · fragrances priced ${priced}`);
  console.log(`elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
