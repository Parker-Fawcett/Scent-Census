/**
 * Scent families: the accord and note vocabularies.
 *
 * A fragrance is not a member of one family, it is a member of several. It
 * has notes (vanilla, leather, civet) and it has community accords (woody,
 * powdery, sweet). Those are the families, and a page per family is the
 * natural way to answer "what else smells like this".
 *
 * The vocabularies are small and change only when the catalogue is
 * re-ingested, so they are fetched once and held in memory. The accordion
 * vocabulary is 92 words and the note vocabulary is a couple of thousand,
 * and neither is worth a round trip per page view.
 */

import type { PrismaInstance } from "@/lib/prisma";
import { PROMINENCE_FLOOR } from "@/domain/prominence";

export type FamilyKind = "accord" | "note";

const CACHE_MS = 30 * 60 * 1000;

interface Vocabulary {
  at: number;
  names: string[];
}

let accordVocabulary: Vocabulary | null = null;
let noteVocabulary: Vocabulary | null = null;

/** the slug a family name is addressed by */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getAccordVocabulary(prisma: PrismaInstance): Promise<string[]> {
  if (accordVocabulary !== null && Date.now() - accordVocabulary.at < CACHE_MS) {
    return accordVocabulary.names;
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ a: string }>>(
    `SELECT DISTINCT unnest(accords) AS a FROM "Fragrance" WHERE cardinality(accords) > 0`,
  );
  const names: string[] = rows.map((r) => r.a).filter((a: string) => a !== "").sort();
  accordVocabulary = { at: Date.now(), names };
  return names;
}

export async function getNoteVocabulary(prisma: PrismaInstance): Promise<string[]> {
  if (noteVocabulary !== null && Date.now() - noteVocabulary.at < CACHE_MS) {
    return noteVocabulary.names;
  }
  const rows = await prisma.note.findMany({ select: { name: true } });
  const names = rows.map((r) => r.name).sort();
  noteVocabulary = { at: Date.now(), names };
  return names;
}

export interface AccordChip {
  name: string;
  slug: string;
  /** how many catalogued fragrances carry this accord */
  count: number;
}

let accordChips: { at: number; chips: AccordChip[] } | null = null;

/**
 * The accord families worth putting on the index, most catalogued first.
 *
 * The count comes from the same accords array the family page reads, so a
 * chip never promises a page that disagrees with it.
 */
export async function loadAccordChips(prisma: PrismaInstance): Promise<AccordChip[]> {
  if (accordChips !== null && Date.now() - accordChips.at < CACHE_MS) {
    return accordChips.chips;
  }
  const rows = await prisma.$queryRaw<{ name: string; count: number }[]>`
    SELECT a AS name, count(*)::int AS count
    FROM (
      SELECT unnest(accords) AS a
      FROM "Fragrance"
      WHERE cardinality(accords) > 0
    ) x
    GROUP BY a
    ORDER BY count DESC, name ASC
    LIMIT 12
  `;
  const chips = rows
    .map((r) => ({ name: r.name, slug: slugify(r.name), count: Number(r.count) }))
    .filter((c) => c.slug !== "");
  accordChips = { at: Date.now(), chips };
  return chips;
}

/**
 * Turn a URL slug back into the family name it addresses.
 * Returns null when there is no such family, which is a 404.
 */
export async function resolveFamilyName(
  prisma: PrismaInstance,
  kind: FamilyKind,
  slug: string,
): Promise<string | null> {
  const vocabulary =
    kind === "accord" ? await getAccordVocabulary(prisma) : await getNoteVocabulary(prisma);
  const wanted = slug.trim().toLowerCase();
  for (const name of vocabulary) {
    if (slugify(name) === wanted) return name;
  }
  return null;
}

export interface FamilyMember {
  id: string;
  name: string;
  slug: string;
  house: string;
  houseSlug: string;
  year: number | null;
  pid: string | null;
  /** how many measured clones this fragrance has as the original */
  cloneCount: number;
}

/**
 * The fragrances in a family, best first.
 *
 * "Best" means the ones the census knows most about: a fragrance with
 * forty measured clones is a better answer to "what else smells woody"
 * than one with none, and it is also the one a reader is likelier to be
 * looking for.
 */
export async function loadFamilyMembers(
  prisma: PrismaInstance,
  kind: FamilyKind,
  name: string,
  limit = 60,
): Promise<FamilyMember[]> {
  if (kind === "accord") {
    return prisma.$queryRaw<FamilyMember[]>`
      WITH candidates AS MATERIALIZED (
        SELECT
          f.id, f.name, f.slug, f.year, f."catalogueSourcePid" AS pid,
          h.name AS "house", h.slug AS "houseSlug", f."popularityMagnitude"
        FROM "Fragrance" f
        JOIN "House" h ON h.id = f."houseId"
        WHERE f.accords && ARRAY[${name}]::text[]
        ORDER BY f."popularityMagnitude" DESC NULLS LAST
        LIMIT 400
      ),
      edge_counts AS MATERIALIZED (
        SELECT "targetId", COUNT(*)::int AS n FROM "InspiredByEdge" GROUP BY "targetId"
      )
      SELECT
        c.id, c.name, c.slug, c.year, c.pid,
        c."house", c."houseSlug", COALESCE(ec.n, 0)::int AS "cloneCount"
      FROM candidates c
      LEFT JOIN edge_counts ec ON ec."targetId" = c.id
      ORDER BY "cloneCount" DESC, c."popularityMagnitude" DESC NULLS LAST
      LIMIT ${limit}
    `;
  }

  const rows = await prisma.$queryRaw<FamilyMember[]>`
    WITH candidates AS MATERIALIZED (
      SELECT
        f.id, f.name, f.slug, f.year, f."catalogueSourcePid" AS pid,
        h.name AS "house", h.slug AS "houseSlug", f."popularityMagnitude"
      FROM "Fragrance" f
      JOIN "House" h ON h.id = f."houseId"
      JOIN "FragranceNote" fn ON fn."fragranceId" = f.id
      JOIN "Note" n ON n.id = fn."noteId"
      WHERE lower(n.name) = lower(${name})
        AND fn.weight > 0
        AND fn.weight >= ${PROMINENCE_FLOOR} * (
          SELECT MAX(fn2.weight) FROM "FragranceNote" fn2 WHERE fn2."fragranceId" = f.id
        )
      ORDER BY f."popularityMagnitude" DESC NULLS LAST
      LIMIT 400
    ),
    edge_counts AS MATERIALIZED (
      SELECT "targetId", COUNT(*)::int AS n FROM "InspiredByEdge" GROUP BY "targetId"
    )
    SELECT
      c.id, c.name, c.slug, c.year, c.pid,
      c."house", c."houseSlug", COALESCE(ec.n, 0)::int AS "cloneCount"
    FROM candidates c
    LEFT JOIN edge_counts ec ON ec."targetId" = c.id
    ORDER BY "cloneCount" DESC, c."popularityMagnitude" DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows;
}

/** how many fragrances are in a family at all */
export async function countFamilyMembers(
  prisma: PrismaInstance,
  kind: FamilyKind,
  name: string,
): Promise<number> {
  if (kind === "accord") {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "Fragrance" WHERE accords && ARRAY[${name}]::text[]
    `;
    return rows[0]?.n ?? 0;
  }
  return prisma.fragranceNote.count({ where: { note: { name } } });
}

/** the houses that use a family the most */
export async function loadFamilyHouses(
  prisma: PrismaInstance,
  kind: FamilyKind,
  name: string,
  limit = 10,
): Promise<Array<{ name: string; slug: string; count: number }>> {
  if (kind === "accord") {
    return prisma.$queryRaw<Array<{ name: string; slug: string; count: number }>>`
      SELECT h.name, h.slug, COUNT(*)::int AS count
      FROM "Fragrance" f
      JOIN "House" h ON h.id = f."houseId"
      WHERE f.accords && ARRAY[${name}]::text[]
      GROUP BY h.id, h.name, h.slug
      ORDER BY count DESC, h.name ASC
      LIMIT ${limit}
    `;
  }
  return prisma.$queryRaw<Array<{ name: string; slug: string; count: number }>>`
    SELECT h.name, h.slug, COUNT(DISTINCT f.id)::int AS count
    FROM "Fragrance" f
    JOIN "House" h ON h.id = f."houseId"
    JOIN "FragranceNote" fn ON fn."fragranceId" = f.id
    JOIN "Note" n ON n.id = fn."noteId"
    WHERE lower(n.name) = lower(${name})
      AND fn.weight > 0
      AND fn.weight >= ${PROMINENCE_FLOOR} * (
        SELECT MAX(fn2.weight) FROM "FragranceNote" fn2 WHERE fn2."fragranceId" = f.id
      )
    GROUP BY h.id, h.name, h.slug
    ORDER BY count DESC, h.name ASC
    LIMIT ${limit}
  `;
}

export interface SimilarFragrance {
  id: string;
  name: string;
  slug: string;
  house: string;
  houseSlug: string;
  year: number | null;
  pid: string | null;
  cloneCount: number;
  /** how many accords this shares with the subject */
  shared: number;
  /** how many of the subject's strongest notes this one also carries */
  sharedNotes: number;
}

/**
 * "Smells like this", for a fragrance that has no measured clone of its own.
 *
 * The smell-alike graph only connects a scent to the things the community
 * said copy it. A scent nobody has voted on yet is not on that graph at
 * all, which used to leave its page empty. The fallback started as accord
 * overlap alone, and that was too loose: Marwa and 1 Million share five
 * accords, so the page called them alike, and they smell nothing alike.
 *
 * Accords are a family summary; notes are the materials. Requiring three
 * shared notes from each scent's strongest ten keeps a real family
 * resemblance and drops the coincidences. This fallback is only used when
 * the census has no measured clone for the page at all.
 */
export async function loadSimilarByAccords(
  prisma: PrismaInstance,
  fragranceId: string,
  accords: string[],
  noteNames: string[],
  limit = 12,
): Promise<SimilarFragrance[]> {
  if (accords.length === 0) return [];
  // Postgres has no array intersection operator in core (the & operator
  // lives in the intarray extension and does not work on text), so the
  // overlap is counted here. The candidate set is narrowed in SQL with
  // the && operator, which is indexable.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      slug: string;
      house: string;
      houseSlug: string;
      year: number | null;
      pid: string | null;
      cloneCount: number;
      ownAccords: string[];
      ownNotes: string[];
    }>
  >`
    WITH candidates AS MATERIALIZED (
      SELECT
        f.id, f.name, f.slug, f.year, f."catalogueSourcePid" AS pid,
        h.name AS "house", h.slug AS "houseSlug",
        f."popularityMagnitude", f.accords AS "ownAccords",
        f."noteNames" AS "ownNotes"
      FROM "Fragrance" f
      JOIN "House" h ON h.id = f."houseId"
      WHERE f.id <> ${fragranceId}
        AND f.accords && ARRAY[${accords}]::text[]
      ORDER BY f."popularityMagnitude" DESC NULLS LAST
      LIMIT 200
    ),
    edge_counts AS MATERIALIZED (
      SELECT "targetId", COUNT(*)::int AS n FROM "InspiredByEdge" GROUP BY "targetId"
    )
    SELECT
      c.id, c.name, c.slug, c.year, c.pid,
      c."house", c."houseSlug", COALESCE(ec.n, 0)::int AS "cloneCount",
      c."ownAccords", c."ownNotes"
    FROM candidates c
    LEFT JOIN edge_counts ec ON ec."targetId" = c.id
    ORDER BY c."popularityMagnitude" DESC NULLS LAST
    LIMIT 120
  `;

  const wanted = new Set(accords.map((a) => a.toLowerCase()));
  const wantedNotes = new Set(noteNames.slice(0, 10).map((n) => n.toLowerCase()));
  return rows
    .map((row) => {
      const shared = row.ownAccords.filter((a) => wanted.has(a.toLowerCase())).length;
      const sharedNotes = row.ownNotes
        .slice(0, 10)
        .filter((n) => wantedNotes.has(n.toLowerCase())).length;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        house: row.house,
        houseSlug: row.houseSlug,
        year: row.year,
        pid: row.pid,
        cloneCount: row.cloneCount,
        shared,
        sharedNotes,
      };
    })
    .filter((row) => row.shared >= 3 && row.sharedNotes >= 3)
    .sort(
      (a, b) =>
        b.sharedNotes - a.sharedNotes ||
        b.shared - a.shared ||
        b.cloneCount - a.cloneCount,
    )
    .slice(0, limit);
}
