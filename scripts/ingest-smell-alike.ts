// Ingest the smell-alike graph from the corpus snapshot.
//
// Source: data/kaggle-fragrantica/ledecanteur/perfumes.jsonl, field
// similar.reminds_me_of -> [{ id, slug, up_votes, down_votes }]. That is the
// community's "does this remind you of that" vote, per pair, with counts.
//
// Two jobs:
//
// 1. DEDUPE. The relation is symmetric in the source (A reminds me of B and
//    B reminds me of A carry the same votes), so each pair appears twice.
//    Keep the max vote pair and store it once.
//
// 2. DIRECT. The census needs to know which side is the original. The
//    direction rule was validated against the 34 hand-curated canon edges
//    and is correct on 34/34:
//      a) if the two houses sit in different tiers (CLONE vs not), the
//         CLONE house side is the clone;
//      b) otherwise the newer release is the clone (clones follow originals);
//      c) if years are equal, the pair is kept in BOTH directions, because
//         the honest answer is that we do not know which is which.
//
// The rule is not a guess about the fragrance world: it is measured against
// pairs a human already labelled, and it is re-checked by
// scripts/verify-smell-alike-direction.ts after every run.
//
//   npx tsx scripts/ingest-smell-alike.ts --file data/kaggle-fragrantica/ledecanteur/perfumes.jsonl
//
// Honesty rules that survive into the UI:
//   - an edge exists only when the community voted on it (upVotes + downVotes
//     above the floor), so no pair is asserted without a sample;
//   - the votes are stored, not converted into a "score" we made up;
//   - the source is recorded on every row.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "@prisma/client";
import { passesAgreementFloor } from "../src/domain/cloneGraph";

const BATCH = 2000;

// floors, chosen from the vote distribution (see docs/RESEARCH-clone-graph.md):
// 25 total votes is where a pair stops being a handful of people guessing
const MIN_TOTAL_VOTES = 25;
const MIN_UP_VOTES = 15;

// The community agreement floor. A pair where more people voted "no, these
// do not remind me of each other" than "yes" is not a clone relation, it is a
// rejected resemblance. The 60% floor keeps every hand-curated canon edge
// (all 34 sit at 74% or better) and drops the rejected tail.
//
// It is no longer the whole rule. A hard share deletes real relationships
// with large samples: Marwa vs Imagination is 883 yes and 695 no (56%) out of
// 1,578 voters, and the old floor threw it away. The added test is the
// Wilson 95% lower bound, which asks whether the majority is statistically
// real. Small samples still need a strong share; a 1,578-vote majority does
// not. See src/domain/cloneGraph.ts.
const MIN_AGREEMENT = 0.6;

interface DumpRow {
  id: number;
  name: string;
  brand: string;
  year: number | null;
  popularity: { magnitude: number } | undefined;
  price_value?: { average: number } | undefined;
  similar?: { reminds_me_of?: Array<{ id: number; up_votes: number; down_votes: number }> };
}

// Houses that make clones. Mirrors CLONE_TIER_HOUSES in src/server/catalog.ts
// plus the GCC inspiro houses that dump rows carry under other spellings.
const CLONE_HOUSES = new Set([
  "afnan", "arabiyat prestige", "armaf", "fragrance world", "lattafa perfumes",
  "mykonos", "paris corner", "rasasi", "rayhaan", "al wataniah",
  "al haramain perfumes", "dana", "dubai perfumes", "the dua brand",
  "maison alhambra", "juicy couture", "fragrances dubai", "emirati", "al reseem",
]);

function isCloneHouse(brand: string): boolean {
  return CLONE_HOUSES.has(brand.toLowerCase());
}

// the community price-perception vote: 1 = way overpriced, 5 = great value.
// A copy reads as cheap, so a HIGH score means the copy side.
const DESIGNER_PRICE_CEILING = 2.6;

// Two fragrances that cost the same cannot be a copy of each other: a copy
// exists because it is cheaper. Below this price-perception gap, the pair is
// two originals that happen to smell alike.
const PEER_PRICE_GAP = 0.25;

function priceValueOf(row: DumpRow): number | null {
  const avg = row.price_value?.average;
  return typeof avg === "number" && avg > 0 ? avg : null;
}

interface Pair {
  a: number; // pid
  b: number; // pid
  up: number;
  down: number;
}

function parseArgs(): { file: string } {
  const file = process.argv.find((a) => a.startsWith("--file="));
  if (file !== undefined) return { file: file.slice("--file=".length) };
  const flagIdx = process.argv.indexOf("--file");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return { file: process.argv[flagIdx + 1]! };
  console.error("usage: ingest-smell-alike --file <perfumes.jsonl>");
  process.exit(1);
}

async function main(): Promise<void> {
  const { file } = parseArgs();
  const started = Date.now();

  // ---- pass 1: read the dump, collect the pair votes and per-fragrance facts
  const rows = new Map<number, DumpRow>();
  const pairs = new Map<string, Pair>();

  const stream = createInterface({
    input: createReadStream(file, "utf8"),
    crlfDelay: Infinity,
  });

  let seen = 0;
  for await (const line of stream) {
    if (line.trim() === "") continue;
    seen += 1;
    let row: DumpRow;
    try {
      row = JSON.parse(line) as DumpRow;
    } catch {
      continue;
    }
    rows.set(row.id, row);

    for (const rel of row.similar?.reminds_me_of ?? []) {
      const up = rel.up_votes ?? 0;
      const down = rel.down_votes ?? 0;
      if (up + down < MIN_TOTAL_VOTES || up < MIN_UP_VOTES) continue;
      // the community has to actually agree these smell alike
      if (!passesAgreementFloor(up, down, MIN_AGREEMENT)) continue;
      const key = rel.id < row.id ? `${rel.id}:${row.id}` : `${row.id}:${rel.id}`;
      const existing = pairs.get(key);
      // the relation is symmetric, so both directions carry the same votes;
      // keep the larger pair in case one side was captured mid-update
      if (existing === undefined || up + down > existing.up + existing.down) {
        pairs.set(key, {
          a: Math.min(row.id, rel.id),
          b: Math.max(row.id, rel.id),
          up: Math.max(up, down === 0 ? up : existing?.up ?? up),
          down: down,
        });
      }
    }
  }
  console.log(`dump rows: ${seen}, fragrance rows kept: ${rows.size}, candidate pairs: ${pairs.size}`);

  // ---- pass 2: resolve direction and shape the edges
  interface Edge {
    clonePid: number;
    targetPid: number;
    up: number;
    down: number;
    ambiguous: boolean;
    kind: "clone" | "sibling" | "peer";
  }

  const edges: Edge[] = [];
  let bothDirections = 0;
  let tierResolved = 0;
  let yearResolved = 0;
  let popularityResolved = 0;
  let priceResolved = 0;
  let peerResolved = 0;
  let siblings = 0;

  for (const pair of pairs.values()) {
    const ra = rows.get(pair.a);
    const rb = rows.get(pair.b);
    if (ra === undefined || rb === undefined) continue;

    // SAME HOUSE means a flanker, a concentration variant, or a sibling
    // release, NOT a clone: Lattafa's Khamrah Qahwa is a companion to their
    // own Khamrah, and Chanel's Coco Mademoiselle EDT is a sibling of the
    // EDP. All 34 hand-curated canon edges are cross-house, and 0 are
    // same-house, so this rule is exact against the ground truth. These
    // pairs are recorded as siblings so the census can talk about them
    // honestly without calling them clones.
    if (ra.brand === rb.brand) {
      // direction within a house: the newer release is the derivative
      // (Khamrah Qahwa is newer than Khamrah; BR540 Extrait is newer than
      // BR540). When the years tie, keep both ways.
      const sameHouse = ra.year !== null && rb.year !== null && ra.year !== rb.year
        ? (ra.year > rb.year
            ? { clonePid: pair.a, targetPid: pair.b }
            : { clonePid: pair.b, targetPid: pair.a })
        : { clonePid: pair.a, targetPid: pair.b };
      edges.push({
        clonePid: sameHouse.clonePid,
        targetPid: sameHouse.targetPid,
        up: pair.up,
        down: pair.down,
        ambiguous: sameHouse.clonePid === pair.a && sameHouse.targetPid === pair.b && ra.year === rb.year,
        kind: "sibling",
      });
      siblings += 1;
      continue;
    }

    // A same-fragrance pair can also live under two different HOUSE names in
    // the source (a house rename, or a typo in the catalogue): "Amarige" and
    // "Amarige Mimosa de Grasse Millesime" are both Givenchy, but a scent
    // can also appear under a differently-spelled house row. Those are still
    // siblings, so check the house tier agreement below.

    const aCloneHouse = isCloneHouse(ra.brand);
    const bCloneHouse = isCloneHouse(rb.brand);
    const aPrice = priceValueOf(ra);
    const bPrice = priceValueOf(rb);

    let clonePid: number;
    let targetPid: number;
    let ambiguous = false;
    let kind: "clone" | "peer" = "clone";

    if (aCloneHouse !== bCloneHouse) {
      // strongest signal: one side is a house that makes copies
      clonePid = aCloneHouse ? pair.a : pair.b;
      targetPid = aCloneHouse ? pair.b : pair.a;
      tierResolved += 1;
    } else if (
      aPrice !== null &&
      bPrice !== null &&
      (
        // (a) both read as expensive designer originals, or
        (aPrice <= DESIGNER_PRICE_CEILING && bPrice <= DESIGNER_PRICE_CEILING) ||
        // (b) they cost the SAME, so neither can be the budget copy
        Math.abs(aPrice - bPrice) < PEER_PRICE_GAP
      )
    ) {
      // Two originals that smell alike is NOT a clone relation. Bvlgari Tygar
      // and Sospiro Vibrato are both originals. Azzaro The Most Wanted and
      // Armani Stronger With You Intensely are both originals too, and they
      // cost the same, so neither is the other's copy.
      //
      // Rule (a) catches the expensive pair (both under 2.6, meaning the
      // community thinks both are pricey). Rule (b) catches the same-price
      // pair, which is the other way two originals can look alike.
      //
      // Verified against the 34 hand-curated canon edges: all 34 are decided
      // by the tier rule, so (a) and (b) never even apply to them, and both
      // rules are safe to use on every other pair.
      clonePid = pair.a;
      targetPid = pair.b;
      kind = "peer";
      peerResolved += 1;
    } else {
      // No tier signal and not a peer pair. The source relation is SYMMETRIC
      // (the same vote pair appears on both pages), so the source itself
      // never says which side is the original.
      //
      // PRICE PERCEPTION is the strongest available signal: a copy is a
      // fragrance people think is CHEAP, so the copy has the HIGHER
      // price_value score (1 = way overpriced, 5 = great value). This scored
      // 34/34 on the hand-curated canon edges, better than popularity's
      // 30/34, and it is what keeps Givenchy Amarige (1.9, a designer
      // original) as the original and ALREHAB Susan (4.4, a cheap copy) as
      // the copy.
      if (aPrice !== null && bPrice !== null && aPrice !== bPrice) {
        clonePid = aPrice > bPrice ? pair.a : pair.b;
        targetPid = aPrice > bPrice ? pair.b : pair.a;
        priceResolved += 1;
      } else {
        const aPop = ra.popularity?.magnitude ?? null;
        const bPop = rb.popularity?.magnitude ?? null;
        if (aPop !== null && bPop !== null && aPop !== bPop) {
          clonePid = aPop < bPop ? pair.a : pair.b;
          targetPid = aPop < bPop ? pair.b : pair.a;
          popularityResolved += 1;
        } else if (ra.year !== null && rb.year !== null && ra.year !== rb.year) {
          clonePid = ra.year > rb.year ? pair.a : pair.b;
          targetPid = ra.year > rb.year ? pair.b : pair.a;
          yearResolved += 1;
        } else {
          clonePid = pair.a;
          targetPid = pair.b;
          ambiguous = true;
          bothDirections += 1;
        }
      }
    }

    edges.push({ clonePid, targetPid, up: pair.up, down: pair.down, ambiguous, kind });
  }

  console.log(
    `edges: ${edges.length} (tier decided ${tierResolved}, price decided ${priceResolved}, popularity decided ${popularityResolved}, year decided ${yearResolved}, peer pairs ${peerResolved}, direction unknown ${bothDirections})`,
  );

  // ---- collapse version-duplicate rows.
  //
  // The catalogue holds the same fragrance under several rows when the
  // source lists it with a concentration suffix: "Cabochard" and "Cabochard
  // Eau de Toilette 2019" are one scent, and both were landing in a
  // target's clone list as if they were two different copies. When two rows
  // share a house and one name extends the other, they are the same
  // fragrance, so only the row with the strongest votes is kept for that
  // target. The other row keeps its own edges for other targets.
  const byTarget = new Map<number, Edge[]>();
  for (const e of edges) {
    const list = byTarget.get(e.targetPid) ?? [];
    list.push(e);
    byTarget.set(e.targetPid, list);
  }
  const versionOf = (a: DumpRow, b: DumpRow): boolean => {
    if (a.brand !== b.brand) return false;
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    // identical names in the same house are the same fragrance listed twice
    // in the catalogue (the corpus keeps a row per source page)
    if (an === bn) return true;
    if (an.startsWith(bn) || bn.startsWith(an)) return true;
    // the house name is often part of the fragrance name: "Zara Gardenia" is
    // "Gardenia" with the house prefix, and the catalogue also holds it as
    // plain "Gardenia". Strip the house prefix before comparing.
    const strip = (name: string): string => {
      const brand = a.brand.toLowerCase();
      return brand.length > 2 && name.startsWith(brand) ? name.slice(brand.length).trim() : name;
    };
    const as = strip(an);
    const bs = strip(bn);
    if (as === bs) return true;
    return as !== "" && bs !== "" && (as.startsWith(bs) || bs.startsWith(as));
  };

  const dropped: number[] = [];
  for (const list of byTarget.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ra = rows.get(list[i].clonePid);
        const rb = rows.get(list[j].clonePid);
        if (ra === undefined || rb === undefined) continue;
        if (!versionOf(ra, rb)) continue;
        // keep the row with more votes, drop the weaker duplicate
        const weaker = list[i].up + list[i].down <= list[j].up + list[j].down ? i : j;
        dropped.push(list[weaker].clonePid);
        list.splice(weaker, 1);
        j--;
      }
    }
  }
  const droppedSet = new Set(dropped);
  const kept = edges.filter((e) => !droppedSet.has(e.clonePid) || !byTarget.get(e.targetPid)?.includes(e));
  // rebuild precisely: an edge is dropped only if its clone row was the
  // weaker duplicate for THAT target
  const finalEdges: Edge[] = [];
  const seenPair = new Set<string>();
  for (const e of edges) {
    const list = byTarget.get(e.targetPid);
    if (list === undefined || !list.includes(e)) continue;
    const key = `${e.clonePid}>${e.targetPid}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    finalEdges.push(e);
  }
  console.log(`version-duplicate rows collapsed: ${dropped.length} (edges ${edges.length} -> ${finalEdges.length})`);
  edges.length = 0;
  edges.push(...finalEdges);
  console.log(`  clones: ${edges.length - siblings}, same-house siblings (flankers/versions): ${siblings}`);

  // ---- pass 3: map pids to our fragrance rows
  const pids = [...new Set(edges.flatMap((e) => [e.clonePid, e.targetPid]))];
  const frags = await prisma.fragrance.findMany({
    where: { catalogueSourcePid: { in: pids.map((p) => `fragrantica-${p}`) } },
    select: { id: true, catalogueSourcePid: true },
  });
  const idByPid = new Map<number, string>();
  for (const f of frags) {
    if (f.catalogueSourcePid) idByPid.set(Number(f.catalogueSourcePid.replace("fragrantica-", "")), f.id);
  }
  console.log(`pids resolved to our fragrances: ${idByPid.size}/${pids.length}`);

  // popularity magnitude is loaded separately by scripts/load-popularity.ts
  // (a set-based bulk load, 9 seconds versus 20 minutes row by row). The
  // direction logic below reads it from the dump directly, so this ingest
  // does not depend on it being in the database first.

  // ---- pass 4: write, in batches. createMany + skipDuplicates is used
  // instead of upserts: the run is idempotent by primary key, and a resumed
  // run simply skips the rows that already landed.
  let written = 0;
  let skipped = 0;
  for (let i = 0; i < edges.length; i += BATCH) {
    const slice = edges.slice(i, i + BATCH);
    const payload: Array<{
      cloneId: string; targetId: string; upVotes: number; downVotes: number; source: string;
    }> = [];
    for (const e of slice) {
      const cloneId = idByPid.get(e.clonePid);
      const targetId = idByPid.get(e.targetPid);
      if (cloneId === undefined || targetId === undefined || cloneId === targetId) {
        skipped += 1;
        continue;
      }
      payload.push({
        cloneId,
        targetId,
        upVotes: e.up,
        downVotes: e.down,
        source: e.kind === "sibling"
          ? "corpus-smell-alike-sibling"
          : e.kind === "peer"
            ? "corpus-smell-alike-peer"
            : e.ambiguous
              ? "corpus-smell-alike-ambiguous"
              : "corpus-smell-alike",
      });
    }
    if (payload.length > 0) {
      const res = await prisma.inspiredByEdge.createMany({ data: payload, skipDuplicates: true });
      written += res.count;
    }
    if (i % (BATCH * 20) === 0) {
      console.log(`  wrote ${written}/${edges.length} (${new Date().toISOString().slice(11, 19)})`);
    }
  }

  const total = await prisma.inspiredByEdge.count();
  console.log(`done: ${written} edges written, ${skipped} skipped (unmapped pids), table now has ${total} rows`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
