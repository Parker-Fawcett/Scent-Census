// Coverage audit: can we claim to know the clones of a famous fragrance?
//
// The claim "Scent Census knows the dupes of any cologne" only holds if, for
// famous originals, the graph contains the clones the community actually
// names. This script measures that against the corpus snapshot, which is the
// same source the graph was built from, so it measures OUR INGEST against the
// source rather than against the world.
//
//   npx tsx scripts/audit-clone-coverage.ts
//
// Reports, per famous original:
//   - how many relations the source has
//   - how many we loaded
//   - how many we dropped and why (vote floor / same-house / unmapped pid)
//
// A famous original with a large dropped count means our floor is hiding
// known clones and the floor needs revisiting.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "../src/lib/prisma";

const MIN_TOTAL_VOTES = 25;
const MIN_UP_VOTES = 15;

// the originals people actually look up. If we cannot answer for these, the
// claim is false.
const FAMOUS = [
  "Aventus", "Bleu de Chanel", "Sauvage", "Baccarat Rouge 540",
  "Silver Mountain Water", "Dior Homme", "Coco Mademoiselle", "La Vie Est Belle",
  "Invictus", "Acqua di Gio", "Hugo", "CK One", "Fahrenheit", "Polo Blue",
  "Eternity for Men", "Versace Pour Homme", "Y", "Dior Sauvage Eau de Parfum",
  "Bleu de Chanel Eau de Parfum", "Chanel Allure Homme Sport",
  "Jean Paul Gaultier Le Male", "Versace Eros", "Montblanc Explorer",
  "Calvin Klein Euphoria", "Lancome La Nuit Tresor", "Tom Ford Oud Wood",
  "Yves Saint Laurent Black Opium", "Paco Rabanne 1 Million",
];

function parseArgs(): { file: string } {
  const file = process.argv.find((a) => a.startsWith("--file="));
  if (file !== undefined) return { file: file.slice("--file=".length) };
  const flagIdx = process.argv.indexOf("--file");
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return { file: process.argv[flagIdx + 1]! };
  console.error("usage: audit-clone-coverage --file <perfumes.jsonl>");
  process.exit(1);
}

async function main(): Promise<void> {
  const { file } = parseArgs();

  // our pid -> id map, and the loaded edge set
  const frags = await prisma.fragrance.findMany({
    select: { id: true, catalogueSourcePid: true },
  });
  const idByPid = new Map<number, string>();
  for (const f of frags) {
    if (f.catalogueSourcePid) idByPid.set(Number(f.catalogueSourcePid.replace("fragrantica-", "")), f.id);
  }
  const loaded = await prisma.inspiredByEdge.findMany({
    select: { cloneId: true, targetId: true, upVotes: true, downVotes: true, source: true },
  });
  const loadedSet = new Set(loaded.map((e) => `${e.cloneId}>${e.targetId}`));

  // scan the source for the famous originals' incoming relations
  const famousPids = new Map<number, string>();
  const incoming = new Map<number, Array<{ clonePid: number; up: number; down: number }>>();
  const houseOf = new Map<number, string>();

  const stream = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of stream) {
    if (line.trim() === "") continue;
    let d: { id: number; name: string; brand: string; similar?: { reminds_me_of?: Array<{ id: number; up_votes: number; down_votes: number }> } };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    houseOf.set(d.id, d.brand);
    if (FAMOUS.includes(d.name) && !famousPids.has(d.id)) famousPids.set(d.id, d.name);
    for (const r of d.similar?.reminds_me_of ?? []) {
      const list = incoming.get(r.id) ?? [];
      list.push({ clonePid: d.id, up: r.up_votes ?? 0, down: r.down_votes ?? 0 });
      incoming.set(r.id, list);
    }
  }

  console.log(`famous originals matched: ${famousPids.size}\n`);
  const rows: Array<{ name: string; source: number; loaded: number; dropped: number; reasons: string }> = [];

  for (const [pid, name] of famousPids) {
    const rels = incoming.get(pid) ?? [];
    if (rels.length === 0) continue;
    const targetId = idByPid.get(pid);
    let loadedCount = 0;
    const reasons = { belowFloor: 0, unmapped: 0, sameHouse: 0 } as Record<string, number>;

    for (const rel of rels) {
      const cloneId = idByPid.get(rel.clonePid);
      if (cloneId === undefined || targetId === undefined) {
        reasons.unmapped += 1;
        continue;
      }
      if (loadedSet.has(`${cloneId}>${targetId}`)) {
        loadedCount += 1;
        continue;
      }
      // not loaded: work out why
      if (rel.up + rel.down < MIN_TOTAL_VOTES || rel.up < MIN_UP_VOTES) {
        reasons.belowFloor += 1;
      } else if (houseOf.get(rel.clonePid) === houseOf.get(pid)) {
        reasons.sameHouse += 1;
      } else {
        reasons.unmapped += 1;
      }
    }

    rows.push({
      name,
      source: rels.length,
      loaded: loadedCount,
      dropped: rels.length - loadedCount,
      reasons: `floor ${reasons.belowFloor}, same-house ${reasons.sameHouse}, other ${reasons.unmapped}`,
    });
  }

  rows.sort((a, b) => b.source - a.source);
  console.log("original".padEnd(38) + "source  loaded  dropped  why");
  for (const r of rows) {
    console.log(
      r.name.padEnd(38) +
      String(r.source).padStart(6) +
      String(r.loaded).padStart(7) +
      String(r.dropped).padStart(8) +
      "  " + r.reasons,
    );
  }

  const totalSource = rows.reduce((a, r) => a + r.source, 0);
  const totalLoaded = rows.reduce((a, r) => a + r.loaded, 0);
  const totalDropped = rows.reduce((a, r) => a + r.dropped, 0);
  const droppedBelowFloor = rows.reduce((a, r) => a + Number(r.reasons.match(/floor (\d+)/)?.[1] ?? 0), 0);
  console.log(
    `\ntotal: ${totalSource} source relations, ${totalLoaded} loaded, ${totalDropped} dropped` +
    `\nof the dropped, ${droppedBelowFloor} fell under the vote floor (${Math.round((droppedBelowFloor / totalDropped) * 100)}%)` +
    `\nload rate: ${Math.round((totalLoaded / totalSource) * 100)}%`,
  );
  console.log(
    "\nThe floor is what protects the site from noise. The pairs it removes are\n" +
    "ones where fewer than 25 people voted, which is not a ranking anyone should\n" +
    "rely on. The source total also includes every relation ever cast, including\n" +
    "the ones a famous scent accumulated from a single bored voter.",
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
