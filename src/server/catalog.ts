// Catalogue over Postgres: import mapped FragDB records (the mapper stays
// structure-only; FKs prove existence) and search using the M1 domain
// ranking, so the seed lands once and stays unique. Idempotency by pid is
// the release-diff contract: re-running an ingest never duplicates, and the
// follow stream can trust catalogueSourcePid as the join key.
//
// The free-path corpus importer (importDumpRecords) shares those semantics:
// pids are "fragrantica-<corpus id>", houses canonicalize by slug so spelling
// variants ("PARIS CORNER" / "Paris Corner") collapse, and community accord /
// note data persists verbatim with honest "unknown" note families.

import { searchCatalog, type CatalogHit } from "@/domain/catalogSearch";
import type { MappedCatalogFragrance } from "@/ingest/fragdb";
import type {
  DumpPyramidNote,
  MappedDumpFragrance,
} from "@/ingest/fragranticaDump";
import type { PrismaInstance } from "@/lib/prisma";

export async function importCatalogRecords(
  prisma: PrismaInstance,
  records: MappedCatalogFragrance[],
): Promise<void> {
  for (const record of records) {
    const house = await prisma.house.upsert({
      where: { slug: houseSlug(record.housePid) },
      create: {
        name: record.houseName,
        slug: houseSlug(record.housePid),
        tier: "DESIGNER", // provisional; curation sets tiers (PRD 7.6)
        catalogueSourcePid: record.housePid,
      },
      update: { name: record.houseName, catalogueSourcePid: record.housePid },
    });

    // slug collision (two fragrances, same name): the pid disambiguates,
    // which is what a refresh looks like after a rebrand anyway
    const slugOwner = await prisma.fragrance.findUnique({
      where: { slug: record.slugBase },
      select: { catalogueSourcePid: true },
    });
    const slug =
      slugOwner === null || slugOwner.catalogueSourcePid === record.pid
        ? record.slugBase
        : `${record.slugBase}-${record.pid}`;

    await prisma.fragrance.upsert({
      where: { catalogueSourcePid: record.pid },
      create: {
        name: record.name,
        slug,
        houseId: house.id,
        year: record.year,
        catalogueSourcePid: record.pid,
      },
      update: { name: record.name, year: record.year },
    });
  }
}

function houseSlug(housePid: string): string {
  return `house-${housePid}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function houseNameSlug(brandName: string): string {
  return brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const CORPUS_PID_PREFIX = "fragrantica-";
const UNKNOWN_FAMILY = "unknown"; // honest until curation (or a paid FragDB load) classifies notes

export interface ImportedDumpSummary {
  houses: number;
  fragrances: number;
  notes: number;
  skippedAlreadyLoaded: number;
}

/**
 * Batched corpus import. Batching exists because the full snapshot is
 * row-per-perfume (tens of thousands); row-by-row upserts would take hours,
 * and set queries per chunk stay inside the same upsert-by-pid semantics:
 * already-loaded rows are skipped, never duplicated.
 */
export async function importDumpRecords(
  prisma: PrismaInstance,
  records: MappedDumpFragrance[],
): Promise<ImportedDumpSummary> {
  if (records.length === 0) {
    return { houses: 0, fragrances: 0, notes: 0, skippedAlreadyLoaded: 0 };
  }

  const pids = records.map((r) => `${CORPUS_PID_PREFIX}${r.fid}`);

  // ---- houses: canonicalize by name slug; first-seen casing wins the display name.
  // House.name is unique app-wide, so "already exists under a different slug"
  // (an earlier ingest or seed created the same brand) must REUSE that row:
  // skipping it would strand every famous fragrance on a missing houseId.
  const houseDisplays = new Map<string, string>(); // name slug -> display name
  for (const r of records) {
    const slug = houseNameSlug(r.brandName);
    if (!houseDisplays.has(slug)) houseDisplays.set(slug, r.brandName);
  }
  const houseIdByKey = new Map<string, string>(); // "house-dump-<slug>" or "name:<display>"
  const resolveHouse = (brandName: string, slug: string): string | undefined =>
    houseIdByKey.get(`house-dump-${slug}`) ?? houseIdByKey.get(`name:${brandName}`);

  const knownOrReusable = await prisma.house.findMany({
    where: {
      OR: [
        { slug: { in: [...houseDisplays.keys()].map((s) => `house-dump-${s}`) } },
        { name: { in: [...houseDisplays.values()] } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });
  for (const h of knownOrReusable) {
    houseIdByKey.set(h.slug, h.id);
    houseIdByKey.set(`name:${h.name}`, h.id);
  }
  const unresolvedBrands = [...houseDisplays.entries()].filter(
    ([slug, display]) => resolveHouse(display, slug) === undefined,
  );
  for (const batch of chunk(unresolvedBrands, 1000)) {
    await prisma.house.createMany({
      data: batch.map(([slug, display]) => ({
        name: display,
        slug: `house-dump-${slug}`,
        tier: "DESIGNER" as const, // provisional; curation sets tiers (PRD 7.6)
        catalogueSourcePid: `dump-house-${slug}`,
      })),
      skipDuplicates: true,
    });
  }
  const allHouses = await prisma.house.findMany({
    where: {
      OR: [
        { slug: { in: [...houseDisplays.keys()].map((s) => `house-dump-${s}`) } },
        { name: { in: [...houseDisplays.values()] } },
      ],
    },
    select: { id: true, slug: true, name: true },
  });
  for (const h of allHouses) {
    houseIdByKey.set(h.slug, h.id);
    houseIdByKey.set(`name:${h.name}`, h.id);
  }

  // ---- fragrances: skip already-loaded pids; resolve slug collisions
  const existingByPid = await prisma.fragrance.findMany({
    where: { catalogueSourcePid: { in: pids } },
    select: { catalogueSourcePid: true },
  });
  const loadedPids = new Set(existingByPid.map((f) => f.catalogueSourcePid));
  const toCreate = records.filter((r) => !loadedPids.has(`${CORPUS_PID_PREFIX}${r.fid}`));

  const slugBases = toCreate.map((r) => r.slugBase);
  const slugOwners = new Map<string, string>(); // slug -> owning pid
  for (const slugBatch of chunk(slugBases, 1000)) {
    const rows = await prisma.fragrance.findMany({
      where: { slug: { in: slugBatch } },
      select: { slug: true, catalogueSourcePid: true },
    });
    for (const row of rows) {
      if (row.catalogueSourcePid) slugOwners.set(row.slug, row.catalogueSourcePid);
    }
  }
  const heldSlugs = new Set<string>(slugOwners.keys());

  const perfumeCore = (r: MappedDumpFragrance) => {
    const pid = `${CORPUS_PID_PREFIX}${r.fid}`;
    // Sequential slug handout: the DB-owned map only covers rows created
    // BEFORE this call, so two same-slug records inside one batch (the
    // corpus repeats ~2000 brand+name lists under two ids) must resolve
    // here, or skipDuplicates would silently drop the later one.
    const ownedBy = slugOwners.get(r.slugBase);
    let slug = ownedBy === undefined || ownedBy === pid ? r.slugBase : `${r.slugBase}-${r.fid}`;
    if (heldSlugs.has(slug) && ownedBy !== pid) {
      slug = `${r.slugBase}-${r.fid}`;
    }
    heldSlugs.add(slug);
    const slugLookup = houseNameSlug(r.brandName);
    const houseId =
      resolveHouse(r.brandName, slugLookup) ??
      (() => {
        // unreachable by construction; a missing house must NEVER surface as
        // Prisma "Argument houseId is missing" without naming the culprit
        throw new Error(`house resolution failed for brand "${r.brandName}" (fid ${r.fid})`);
      })();
    return {
      name: r.name,
      slug,
      houseId,
      year: r.year,
      perfumer: r.perfumers[0] ?? null, // lead perfumer; the corpus order is the source order
      accords: [...r.accords]
        .sort((a, b) => b.strength - a.strength)
        .map((a) => a.name),
      catalogueSourcePid: pid,
    };
  };

  for (const batch of chunk(toCreate, 1000)) {
    await prisma.fragrance.createMany({ data: batch.map(perfumeCore), skipDuplicates: true });
  }

  // ids for the pyramid rows we just created
  const createdIds: { pid: string; id: string }[] = [];
  for (const pidBatch of chunk(pids, 1000)) {
    const rows = await prisma.fragrance.findMany({
      where: { catalogueSourcePid: { in: pidBatch } },
      select: { id: true, catalogueSourcePid: true },
    });
    for (const row of rows) {
      if (row.catalogueSourcePid) createdIds.push({ pid: row.catalogueSourcePid, id: row.id });
    }
  }
  const fragranceIdByPid = new Map(createdIds.map((r) => [r.pid, r.id]));

  // ---- notes: global Note table (family honest-unknown now), then pyramids
  const noteNames = new Set<string>();
  for (const r of records) {
    for (const n of r.pyramid) noteNames.add(n.name);
  }
  const noteNameList = [...noteNames];
  const existingNotes = await prisma.note.findMany({
    where: { name: { in: noteNameList } },
    select: { id: true, name: true },
  });
  const noteIdByName = new Map(existingNotes.map((n) => [n.name, n.id]));
  const missingNoteNames = noteNameList.filter((n) => !noteIdByName.has(n));
  for (const noteBatch of chunk(missingNoteNames, 1000)) {
    await prisma.note.createMany({
      data: noteBatch.map((name) => ({ name, family: UNKNOWN_FAMILY })),
      skipDuplicates: true,
    });
  }
  for (const noteBatch of chunk(noteNameList, 1000)) {
    const rows = await prisma.note.findMany({
      where: { name: { in: noteBatch } },
      select: { id: true, name: true },
    });
    for (const row of rows) noteIdByName.set(row.name, row.id);
  }

  const pyramidRows = new Map<string, {
    fragranceId: string;
    noteId: string;
    position: DumpPyramidNote["position"];
    weight: number;
  }>();
  for (const r of records) {
    const fragranceId = fragranceIdByPid.get(`${CORPUS_PID_PREFIX}${r.fid}`);
    if (!fragranceId) continue;
    for (const n of r.pyramid) {
      const noteId = noteIdByName.get(n.name);
      if (!noteId) continue;
      const key = `${fragranceId}|${noteId}|${n.position}`;
      if (!pyramidRows.has(key)) {
        // corpus weights are 0..100 community votes; the domain scale is 0..1
        pyramidRows.set(key, { fragranceId, noteId, position: n.position, weight: n.weight / 100 });
      }
    }
  }
  const pyramidList = [...pyramidRows.values()];
  for (const pyramidBatch of chunk(pyramidList, 1000)) {
    await prisma.fragranceNote.createMany({ data: pyramidBatch, skipDuplicates: true });
  }

  return {
    houses: houseDisplays.size,
    fragrances: toCreate.length,
    notes: pyramidList.length,
    skippedAlreadyLoaded: records.length - toCreate.length,
  };
}

export interface LoadedDumpFragrance {
  id: string;
  name: string;
  house: { id: string; name: string };
  accordNames: string[];
  notes: { name: string; position: string; weight: number }[];
}

// ---- curation (PRD 7.6): the corpus ships every house as DESIGNER default;
// the honestly-known GCC clone/inspiro-heavy houses get the CLONE tier so the
// feed's house-fit steering works from day one. Keyed by name slug so the
// corpus's casing variants ("PARIS CORNER" / "Paris Corner") both match.
// Deliberately minimal: houses I cannot honestly classify stay DESIGNER.
const CLONE_TIER_HOUSES = [
  "afnan",
  "arabiyat-prestige",
  "armaf",
  "fragrance-world",
  "lattafa-perfumes",
  "mykonos",
  "paris-corner",
].map((slug) => `house-dump-${slug}`);

/**
 * Re-runnable curation pass; part of the ingest pipeline.
 */
export async function applyProvisionalHouseTiers(prisma: PrismaInstance): Promise<void> {
  await prisma.house.updateMany({
    where: { slug: { in: CLONE_TIER_HOUSES }, tier: "DESIGNER" },
    data: { tier: "CLONE" },
  });
}

/** Test/verification helper: load by corpus pid, with pyramid resolved. */
export async function loadDumpByPids(
  prisma: PrismaInstance,
  pids: string[],
): Promise<LoadedDumpFragrance[]> {
  const rows = await prisma.fragrance.findMany({
    where: { catalogueSourcePid: { in: pids } },
    include: { house: true, notes: { include: { note: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    house: { id: row.house.id, name: row.house.name },
    accordNames: row.accords,
    notes: row.notes
      .map((n) => ({ name: n.note.name, position: n.position, weight: n.weight }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export async function searchCatalogInDb(
  prisma: PrismaInstance,
  query: string,
): Promise<CatalogHit[]> {
  // At corpus scale the catalog is tens of thousands of rows, so the SQL
  // layer narrows candidates first (name or house matches any word); the
  // M1 domain ranking then orders the narrowed set exactly as before.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  // every word must appear somewhere (name or house name); Postgres contains
  // is case-sensitive by default, so the insensitive mode preserves the
  // domain layer's own case handling
  const rows = await prisma.fragrance.findMany({
    where:
      words.length === 0
        ? undefined
        : {
            AND: words.map((w) => ({
              OR: [
                { name: { contains: w, mode: "insensitive" as const } },
                { house: { name: { contains: w, mode: "insensitive" as const } } },
              ],
            })),
          },
    include: { house: true, notes: { include: { note: true } } },
    take: 500,
  });
  const catalogRecords = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    house: { id: row.house.id, name: row.house.name, slug: row.house.slug, tier: row.house.tier },
    year: row.year,
    inspiredById: row.inspiredById,
    noteNames: row.notes.map((n) => n.note.name),
    accordNames: row.accords,
  }));
  return searchCatalog(catalogRecords, query);
}
