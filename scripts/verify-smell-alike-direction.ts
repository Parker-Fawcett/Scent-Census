// Verify the smell-alike direction heuristic against the hand-curated canon
// edges. The heuristic in scripts/ingest-smell-alike.ts decides which side of
// a pair is the original. If that rule ever drifts, the whole census graph
// points the wrong way, so this check runs against ground truth.
//
// Ground truth: the 34 canon edges on Fragrance.inspiredById, each labelled by
// a human as clone -> original.
//
//   npx tsx scripts/verify-smell-alike-direction.ts
//
// Exit code 1 on any mismatch, so it can gate a deploy.

import { prisma } from "../src/lib/prisma";

const CLONE_HOUSES = new Set([
  "afnan", "arabiyat prestige", "armaf", "fragrance world", "lattafa perfumes",
  "mykonos", "paris corner", "rasasi", "rayhaan", "al wataniah",
  "al haramain perfumes", "dana", "dubai perfumes", "the dua brand",
  "maison alhambra", "juicy couture", "fragrances dubai", "emirati", "al reseem",
]);

function isCloneHouse(brand: string): boolean {
  return CLONE_HOUSES.has(brand.toLowerCase());
}

async function main(): Promise<void> {
  const canon = await prisma.fragrance.findMany({
    where: { inspiredById: { not: null } },
    select: {
      name: true,
      year: true,
      house: { select: { name: true } },
      inspiredBy: { select: { name: true, year: true, house: { select: { name: true } } } },
    },
  });

  let tierDecided = 0;
  let yearDecided = 0;
  let undecided = 0;
  let sameHouse = 0;
  const failures: string[] = [];

  for (const c of canon) {
    const clone = c;
    const target = c.inspiredBy;
    if (target === null) continue;

    // a clone comes from a DIFFERENT house. Same house means a flanker or a
    // concentration variant (Lattafa Khamrah Qahwa next to Khamrah), never a
    // copy of the house's own scent.
    if (clone.house.name === target.house.name) {
      sameHouse += 1;
      failures.push(
        `${clone.house.name} ${clone.name} -> ${target.house.name} ${target.name}: same house, so this is a sibling, not a clone`,
      );
      continue;
    }

    const cloneIsCloneHouse = isCloneHouse(clone.house.name);
    const targetIsCloneHouse = isCloneHouse(target.house.name);

    let predicted: "clone" | "target" | "unknown";
    if (cloneIsCloneHouse !== targetIsCloneHouse) {
      predicted = cloneIsCloneHouse ? "clone" : "target";
      tierDecided += 1;
    } else if (clone.year !== null && target.year !== null && clone.year !== target.year) {
      predicted = clone.year > target.year ? "clone" : "target";
      yearDecided += 1;
    } else {
      predicted = "unknown";
      undecided += 1;
    }

    if (predicted !== "clone") {
      failures.push(
        `${clone.house.name} ${clone.name} (y=${clone.year}) -> ${target.house.name} ${target.name} (y=${target.year}): predicted ${predicted}`,
      );
    }
  }

  console.log(`canon edges checked: ${canon.length}`);
  console.log(`  tier decided: ${tierDecided}, year decided: ${yearDecided}, undecided: ${undecided}`);
  console.log(`  same-house canon edges (must be zero): ${sameHouse}`);
  console.log(`  correct: ${canon.length - failures.length}/${canon.length}`);

  // the same-house rule has to hold for the loaded graph too
  const sameHouseLoaded = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c
    FROM "InspiredByEdge" e
    JOIN "Fragrance" c ON c.id = e."cloneId"
    JOIN "Fragrance" t ON t.id = e."targetId"
    WHERE c."houseId" = t."houseId" AND e.source = 'corpus-smell-alike'`;
  const sameHouseLoadedCount = sameHouseLoaded[0]?.c ?? 0;
  console.log(`  loaded clone edges with the same house on both sides (must be zero): ${sameHouseLoadedCount}`);
  if (sameHouseLoadedCount > 0) {
    failures.push(`${sameHouseLoadedCount} loaded clone edges have the same house on both sides`);
  }

  if (failures.length > 0) {
    console.error("\nFAILURES (the heuristic would mislabel these):");
    for (const f of failures) console.error("  " + f);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\nall canon edges agree with the heuristic");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
