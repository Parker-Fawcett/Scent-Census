// A bench for the catalogue search. Run it after touching the search:
//   npx tsx --env-file=.env scripts/test-search.ts
import { PrismaClient } from "@prisma/client";
import { searchCatalogue } from "../src/server/catalogueSearch";

const prisma = new PrismaClient();

const QUERIES = [
  "lattafa", "lattfa", "Lattafa", "creed", "avntus", "turathi blue",
  "club de nuit", "aventus", "lattafa perfumes", "green irish tweed",
  "silver mountain water", "interlude", "tuxedo", "osmo",
  "aventus creed", "turathi",
];

async function main() {
  for (const q of QUERIES) {
    const t0 = Date.now();
    const hits = await searchCatalogue(prisma, q, { limit: 5 });
    const ms = Date.now() - t0;
    console.log(
      `[${q}] ${hits.length} hits ${ms}ms :: ` +
        hits.map((h) => `${h.name} (${h.house}, ${h.matchKind}, ${h.cloneCount} clones)`).join(" | "),
    );
  }
  await prisma.$disconnect();
}

main();
