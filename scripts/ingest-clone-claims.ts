// Ingest public clone claims for one original.
//
// Usage:
//   npx tsx --env-file=.env scripts/ingest-clone-claims.ts data/clones/louis-vuitton-imagination.json
//   npx tsx --env-file=.env scripts/ingest-clone-claims.ts data/clones/*.json --dry-run
//
// Every claim is provenance first. We store what the seller wrote, where we
// read it, and when. The only computed value is noteMatch, which compares the
// product's published note list with the original's prominent notes. A claim
// never becomes a closeness percentage, and a claim never enters the census.

import { readFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { compositionMatch, scentFamilyMatch } from "../src/domain/cloneClaims";

const prisma = new PrismaClient();

interface ClaimFile {
  target: { brand: string; name: string; catalogueSourcePid: number };
  updated: string;
  claims: Array<{
    productName: string;
    houseName: string;
    claimType: "HOUSE_DECLARED" | "COMMUNITY_LIST" | "EDITORIAL";
    sourceLabel: string;
    sourceUrl: string;
    verifiedOn: string;
    notes?: string[];
    textureNote?: string;
    priceCents?: number;
    sizeMl?: number;
    currency?: string;
    claimedSimilarity?: string;
    discontinued?: boolean;
  }>;
}

/** "ALT. Fragrances" and "alt fragrances" are the same seller. */
function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const dryRun = process.argv.includes("--dry-run");
const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const CORPUS_ARG = process.argv.find((arg) => arg.startsWith("--corpus="));
const CORPUS_PATH =
  CORPUS_ARG?.slice("--corpus=".length) ??
  "data/kaggle-fragrantica/ledecanteur/perfumes.jsonl";

if (files.length === 0) {
  console.error("Pass at least one claims JSON file.");
  process.exit(1);
}

interface CorpusVote {
  up: number;
  down: number;
  brand: string;
  name: string;
}

/**
 * Read the raw smell-alike votes for one original out of the corpus snapshot.
 *
 * The graph ingest deliberately drops pairs below the agreement floor, so the
 * database has no row for them. A claim still needs the number: "voted on and
 * rejected" is a different fact from "never voted on", and printing the second
 * when the first is true is a lie. The scan is one pass over the snapshot and
 * only parses lines that mention the target id.
 */
async function loadCorpusVotes(
  path: string,
  targetPid: number,
): Promise<{ byPid: Map<string, CorpusVote>; byName: Map<string, CorpusVote> }> {
  const byPid = new Map<string, CorpusVote>();
  const byName = new Map<string, CorpusVote>();
  const needle = String(targetPid);

  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let scanned = 0;
  for await (const line of lines) {
    scanned += 1;
    if (!line.includes(needle)) continue;
    let record: {
      id?: number;
      brand?: string;
      name?: string;
      similar?: { reminds_me_of?: Array<{ id?: number; up_votes?: number; down_votes?: number }> };
    };
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const relations = record.similar?.reminds_me_of;
    if (!Array.isArray(relations)) continue;
    const rel = relations.find((entry) => entry.id === targetPid);
    if (rel === undefined) continue;
    const vote: CorpusVote = {
      up: Number(rel.up_votes ?? 0),
      down: Number(rel.down_votes ?? 0),
      brand: record.brand ?? "",
      name: record.name ?? "",
    };
    if (record.id !== undefined) byPid.set(`fragrantica-${record.id}`, vote);
    byName.set(`${normalizeKey(vote.brand)}::${normalizeKey(vote.name)}`, vote);
  }
  console.log(`scanned ${scanned.toLocaleString("en-US")} corpus rows, ${byPid.size} carry votes for ${targetPid}`);
  return { byPid, byName };
}

async function ingestFile(path: string) {
  const raw = JSON.parse(readFileSync(path, "utf8")) as ClaimFile;
  const target = await prisma.fragrance.findFirst({
    where: {
      catalogueSourcePid: `fragrantica-${raw.target.catalogueSourcePid}`,
    },
    include: { house: true },
  });
  const targetAlt =
    target === null
      ? await prisma.fragrance.findFirst({
          where: {
            catalogueSourcePid: String(raw.target.catalogueSourcePid),
          },
          include: { house: true },
        })
      : target;

  if (targetAlt === null) {
    console.error(`${path}: no fragrance with pid ${raw.target.catalogueSourcePid}`);
    return { file: path, written: 0, failed: 1 };
  }

  const original = await prisma.fragrance.findUnique({
    where: { id: targetAlt.id },
    include: { notes: { include: { note: true } }, house: true },
  });
  if (original === null) {
    console.error(`${path}: target disappeared`);
    return { file: path, written: 0, failed: 1 };
  }

  // Every note the original publishes counts, because this comparison is
  // about published lists rather than about what voters ranked. Weight still
  // matters: a note nobody voted for contributes almost nothing to recall,
  // so the black tea everyone smells dominates the frankincense nobody did.
  const originalNotes = original.notes.map((row) => ({
    name: row.note.name,
    weight: Math.max(row.weight * 100, 1),
  }));

  console.log(
    `\n${original.house.name} ${original.name}: ${originalNotes.length} published notes in the catalogue\n`,
  );

  const corpusVotes = await loadCorpusVotes(CORPUS_PATH, raw.target.catalogueSourcePid);

  let written = 0;
  let failed = 0;

  for (const claim of raw.claims) {
    const house = await prisma.house.findFirst({
      where: { name: { equals: claim.houseName, mode: "insensitive" } },
      select: { id: true, name: true },
    });

    let clone = null;
    if (house !== null) {
      const candidates = await prisma.fragrance.findMany({
        where: { houseId: house.id },
        include: { notes: { include: { note: true } } },
      });
      clone =
        candidates.find((c) => normalizeKey(c.name) === normalizeKey(claim.productName)) ?? null;
    }

    const edge =
      clone === null
        ? null
        : await prisma.inspiredByEdge.findUnique({
            where: { cloneId_targetId: { cloneId: clone.id, targetId: original.id } },
          });

    // Below-floor pairs are not edges, but the corpus still counted the votes.
    // Prefer the catalogue pid, then the seller's own brand and product name.
    const corpusVote =
      (clone?.catalogueSourcePid != null
        ? corpusVotes.byPid.get(clone.catalogueSourcePid)
        : undefined) ??
      corpusVotes.byName.get(
        `${normalizeKey(claim.houseName)}::${normalizeKey(claim.productName)}`,
      );

    // Seller-published notes win when we have them: they are what the buyer
    // can actually read on the listing. Inside the catalogue we fall back to
    // the community-voted pyramid, which is the only list we hold.
    const claimNotes =
      claim.notes !== undefined && claim.notes.length > 0
        ? claim.notes
        : clone !== null
          ? clone.notes.map((row) => row.note.name)
          : [];

    const match =
      originalNotes.length > 0 && claimNotes.length > 0
        ? compositionMatch(originalNotes, claimNotes)
        : null;

    // Scent family match: 50% accord cosine + 50% note Jaccard.
    // Accords in the DB are sorted by strength (strongest first), so we
    // assign position-based weights. Notes use their real community weights.
    const accordWeights = (accords: string[]) =>
      Object.fromEntries(accords.map((a, i) => [a.toLowerCase(), 100 - i * 12.5]));
    const targetAccordMap = accordWeights(original.accords);
    const cloneAccordMap =
      clone !== null
        ? accordWeights(clone.accords)
        : {};
    const targetNoteNames = original.notes.map((n) => n.note.name);
    const cloneNoteNames =
      claim.notes !== undefined && claim.notes.length > 0
        ? claim.notes
        : clone !== null
          ? clone.notes.map((n) => n.note.name)
          : [];
    // An empty note list is missing data, not a verified zero overlap.
    const hasNoteData = cloneNoteNames.length > 0;
    const familyMatch = hasNoteData
      ? scentFamilyMatch(targetNoteNames, targetAccordMap, cloneNoteNames, cloneAccordMap)
      : null;

    const status =
      edge !== null ? "MEASURED" : clone !== null ? "UNMEASURED" : "OUTSIDE_CATALOGUE";

    const data = {
      cloneId: clone?.id ?? null,
      claimType: claim.claimType,
      status: status as "MEASURED" | "UNMEASURED" | "OUTSIDE_CATALOGUE",
      sourceLabel: claim.sourceLabel,
      sourceUrl: claim.sourceUrl,
      verifiedOn: new Date(`${claim.verifiedOn}T00:00:00Z`),
      notes: claim.notes ?? [],
      noteMatch: match?.score ?? null,
      familyMatch,
      textureNote: claim.textureNote ?? null,
      measuredUp: corpusVote?.up ?? null,
      measuredDown: corpusVote?.down ?? null,
      claimedSimilarity: claim.claimedSimilarity ?? null,
      priceCents: claim.priceCents ?? null,
      sizeMl: claim.sizeMl ?? null,
      currency: claim.currency ?? null,
      discontinued: claim.discontinued ?? false,
    };

    const label = `${claim.houseName} ${claim.productName}`;
    const voteTail =
      corpusVote !== null && corpusVote !== undefined && corpusVote.up + corpusVote.down > 0
        ? `voted ${Math.round((corpusVote.up / (corpusVote.up + corpusVote.down)) * 100)}% on ${(
            corpusVote.up + corpusVote.down
          ).toLocaleString("en-US")} votes`
        : null;
    const matchTail =
      match === null
        ? "no note data"
        : `note match ${match.score}%`;
    const familyTail = familyMatch === null ? "no note data" : `family match ${familyMatch}%`;
    const tail =
      voteTail !== null
        ? `${voteTail} · ${familyTail}`
        : `${familyTail} · ${matchTail}`;

    if (!dryRun) {
      try {
        await prisma.cloneClaim.upsert({
          where: {
            targetId_houseName_productName: {
              targetId: original.id,
              houseName: claim.houseName,
              productName: claim.productName,
            },
          },
          create: {
            targetId: original.id,
            productName: claim.productName,
            houseName: claim.houseName,
            ...data,
          },
          update: data,
        });
      } catch (error) {
        failed += 1;
        console.error(`  FAIL ${label}: ${(error as Error).message}`);
        continue;
      }
    }
    written += 1;
    console.log(`  ${status.padEnd(17)} ${label.padEnd(38)} ${tail}`);
  }

  return { file: path, written, failed };
}

async function main() {
  let written = 0;
  let failed = 0;
  for (const path of files) {
    const result = await ingestFile(path);
    written += result.written;
    failed += result.failed;
  }
  console.log(`\n${dryRun ? "would write" : "wrote"} ${written} claims, ${failed} failed`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
