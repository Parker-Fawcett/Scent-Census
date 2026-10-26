/**
 * Catalogue search that forgives.
 *
 * The old search required the visitor to type the name almost exactly. The
 * SQL narrowed candidates with a case-insensitive substring match, every
 * query word had to land somewhere in the name or the house name, and the
 * ranking ran over an unordered slice of 500 rows. Typing "lattfa" found
 * nothing, and "turathi blue" was buried under every fragrance with "blue"
 * in the name.
 *
 * How it works now:
 *
 * 1. A tight, indexable pass. Prefix patterns catch multi-word names
 *    ("turathi blue" finds "Turathi Blue") and the pg_trgm operator catches
 *    typos. Both run against lower(name), which is where the GIN trigram
 *    index lives: `f.name % 'x'` is a sequential scan over 140,000 rows,
 *    while `lower(f.name) % 'x'` is an index scan that takes five
 *    milliseconds. The difference is the whole search budget.
 * 2. Houses are matched the same way, plus a word-level pass, because the
 *    house table is small. A typo in a house name does not survive a
 *    similarity test against the whole name: "lattfa" against "lattafa
 *    perfumes" scores 0.21, while "lattfa" against the word "lattafa"
 *    scores 0.5.
 * 3. The final ranking happens here, over the merged candidates, so the
 *    order is a product decision rather than a database artefact.
 *
 * Round trips matter more than they look. Neon is a remote database and a
 * trivial query costs about 70ms end to end, so the search makes three
 * deliberate ones rather than five.
 */

import type { PrismaClient } from "@prisma/client";

export type MatchKind =
  | "exact-name"
  | "name-prefix"
  | "word-prefix"
  | "house-exact"
  | "house-prefix"
  | "name-contains"
  | "house-match"
  | "close-spelling";

export interface CatalogueHit {
  id: string;
  name: string;
  slug: string;
  house: string;
  houseSlug: string;
  year: number | null;
  pid: string | null;
  cloneCount: number;
  matchKind: MatchKind;
  score: number;
}

export interface CandidateRow {
  id: string;
  name: string;
  slug: string;
  year: number | null;
  catalogueSourcePid: string | null;
  houseId: string;
  houseName: string;
  houseSlug: string;
  /** how many measured clones this fragrance has as the original */
  cloneCount: number;
}

interface HouseRow {
  id: string;
  name: string;
  slug: string;
}

/** strip diacritics, lowercase, squeeze whitespace */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trigram similarity, the same measure pg_trgm uses, so a ranking decision
 * made here agrees with the candidate selection the database did.
 */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): string[] => {
    const t = `  ${fold(s)} `;
    const out: string[] = [];
    for (let i = 0; i < t.length - 2; i++) out.push(t.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.length === 0 || gb.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of gb) pool.set(g, (pool.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of ga) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      shared += 1;
      pool.set(g, n - 1);
    }
  }
  return shared / (ga.length + gb.length - shared);
}

/**
 * Edit distance, with an early exit.
 *
 * Trigram similarity punishes short words: "clb" against "club" scores
 * 0.375, which is below any sane threshold, even though dropping one
 * letter is exactly the typo people make. Edit distance catches the
 * dropped, doubled and swapped letter, so the two measures are used
 * together.
 */
export function editDistanceAtMost(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How far a query word can be from a name word and still be the same word.
 * One letter on a short word, two on a longer one.
 */
export function typoTolerance(word: string): number {
  return word.length >= 8 ? 2 : 1;
}

const KIND_RANK: Record<MatchKind, number> = {
  "exact-name": 0,
  "name-prefix": 1,
  "word-prefix": 2,
  "house-exact": 3,
  "house-prefix": 4,
  "name-contains": 5,
  "house-match": 6,
  "close-spelling": 7,
};

/** the label a reader sees next to a result */
export const MATCH_LABELS: Record<MatchKind, string> = {
  "exact-name": "Exact name",
  "name-prefix": "Starts with that",
  "word-prefix": "Word match",
  "house-exact": "That house",
  "house-prefix": "That house",
  "name-contains": "Name match",
  "house-match": "House match",
  "close-spelling": "Close spelling",
};

export interface SearchOptions {
  limit?: number;
  /** only fragrances that have at least one measured clone */
  withClonesOnly?: boolean;
}

export async function searchCatalogue(
  prisma: PrismaClient,
  query: string,
  opts: SearchOptions = {},
): Promise<CatalogueHit[]> {
  const limit = opts.limit ?? 60;
  const raw = fold(query);
  if (raw === "") return [];

  const words = raw.split(" ").filter(Boolean).slice(0, 6);
  const prefixes = [raw, ...words].map((w) => `${w}%`);

  // ONE round trip: the fragrance candidates and the house candidates, with
  // the fragrances of any matched house folded in at the same time.
  const rows = await prisma.$queryRaw<
    Array<
      CandidateRow & { kind: "f" | "h" | "hf"; cloneCount: number }
    >
  >`
    WITH edge_counts AS MATERIALIZED (
      SELECT "targetId", COUNT(*)::int AS n FROM "InspiredByEdge" GROUP BY "targetId"
    ),
    house_hits AS MATERIALIZED (
      SELECT h.id, h.name, h.slug
      FROM "House" h
      WHERE lower(h.name) LIKE ANY (${prefixes}::text[])
         OR lower(h.name) % ${raw}
         OR word_similarity(${raw}, h.name) > 0.4
      ORDER BY
        CASE
          WHEN lower(h.name) = ${raw} THEN 0
          WHEN lower(h.name) LIKE ${`${raw}%`} THEN 1
          WHEN lower(h.name) LIKE ANY (${prefixes}::text[]) THEN 2
          ELSE 3
        END
      LIMIT 40
    ),
    frag_hits AS MATERIALIZED (
      SELECT
        f.id, f.name, f.slug, f.year, f."catalogueSourcePid", f."houseId",
        h.name AS "houseName", h.slug AS "houseSlug",
        COALESCE(ec.n, 0)::int AS "cloneCount"
      FROM "Fragrance" f
      JOIN "House" h ON h.id = f."houseId"
      LEFT JOIN edge_counts ec ON ec."targetId" = f.id
      WHERE lower(f.name) LIKE ANY (${prefixes}::text[])
         OR lower(h.name) LIKE ANY (${prefixes}::text[])
         OR lower(f.name) % ${raw}
         OR lower(h.name) % ${raw}
      ORDER BY f."popularityMagnitude" DESC NULLS LAST, length(f.name) ASC
      LIMIT 150
    ),
    house_frags AS MATERIALIZED (
      SELECT
        f.id, f.name, f.slug, f.year, f."catalogueSourcePid", f."houseId",
        h.name AS "houseName", h.slug AS "houseSlug",
        COALESCE(ec.n, 0)::int AS "cloneCount"
      FROM "Fragrance" f
      JOIN "House" h ON h.id = f."houseId"
      LEFT JOIN edge_counts ec ON ec."targetId" = f.id
      WHERE f."houseId" IN (SELECT id FROM house_hits)
      ORDER BY f."popularityMagnitude" DESC NULLS LAST, length(f.name) ASC
      LIMIT 120
    )
    SELECT
      'f' AS kind, id, name, slug, year, "catalogueSourcePid", "houseId",
      "houseName", "houseSlug", "cloneCount"
    FROM frag_hits
    UNION ALL
    SELECT
      'hf' AS kind, id, name, slug, year, "catalogueSourcePid", "houseId",
      "houseName", "houseSlug", "cloneCount"
    FROM house_frags
    UNION ALL
    SELECT
      'h' AS kind, id, name, NULL, NULL, NULL, id, name, slug, 0
    FROM house_hits
  `;

  // The broad pass: every word of the query has to be somewhere in the name
  // or the house, in any order, so "club de nuit" finds "Club de Nuit
  // Intense Man". The concatenation cannot use an index, so it only runs
  // when the tight pass came back thin.
  const found = rows.filter((r) => r.kind !== "h");
  if (found.length < 12 && words.length > 1) {
    const broadPatterns = words.map((w) => `%${w}%`);
    const broad = await prisma.$queryRaw<Array<CandidateRow & { cloneCount: number }>>`
      WITH edge_counts AS MATERIALIZED (
        SELECT "targetId", COUNT(*)::int AS n FROM "InspiredByEdge" GROUP BY "targetId"
      )
      SELECT
        f.id, f.name, f.slug, f.year, f."catalogueSourcePid", f."houseId",
        h.name AS "houseName", h.slug AS "houseSlug",
        COALESCE(ec.n, 0)::int AS "cloneCount"
      FROM "Fragrance" f
      JOIN "House" h ON h.id = f."houseId"
      LEFT JOIN edge_counts ec ON ec."targetId" = f.id
      WHERE (lower(f.name) || ' ' || lower(h.name)) LIKE ALL (${broadPatterns}::text[])
      ORDER BY f."popularityMagnitude" DESC NULLS LAST, length(f.name) ASC
      LIMIT 150
    `;
    const seen = new Set(found.map((r) => r.id));
    for (const row of broad) if (!seen.has(row.id)) rows.push({ ...row, kind: "f" });
  }

  const houseRows = rows.filter((r) => r.kind === "h");
  const fragranceRows: CandidateRow[] = [];
  const seenIds = new Set<string>();
  for (const row of rows) {
    if (row.kind === "h") continue;
    if (seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    fragranceRows.push(row);
  }

  return rankCandidates(fragranceRows, houseRows, raw, opts);
}

/**
 * The ranking, with no database in it.
 *
 * The house matches are worked out here rather than in SQL, because the
 * house table is small and a typo in a house name does not survive a
 * similarity test against the whole name: "lattfa" against "lattafa
 * perfumes" scores 0.21, while "lattfa" against the word "lattafa" scores
 * 0.5. The word level test has to happen where the words are.
 */
export function rankCandidates(
  fragranceRows: CandidateRow[],
  houseRows: Array<{ id: string; name: string }>,
  rawQuery: string,
  opts: SearchOptions = {},
): CatalogueHit[] {
  const limit = opts.limit ?? 60;
  const raw = fold(rawQuery);
  if (raw === "") return [];
  const words = raw.split(" ").filter(Boolean).slice(0, 6);

  const houseById = new Map<string, { kind: MatchKind; score: number }>();
  for (const house of houseRows) {
    const houseName = fold(house.name);
    const houseWords = houseName.split(" ");
    if (houseName === raw) {
      houseById.set(house.id, { kind: "house-exact", score: 800 });
      continue;
    }
    if (houseName.startsWith(raw)) {
      houseById.set(house.id, { kind: "house-prefix", score: 700 });
      continue;
    }
    if (houseName.includes(raw)) {
      houseById.set(house.id, { kind: "house-match", score: 600 });
      continue;
    }
    let allWords = true;
    let best = 0;
    for (const w of words) {
      if (houseWords.some((hw) => hw.startsWith(w))) {
        best = Math.max(best, 1);
        continue;
      }
      let wordBest = 0;
      for (const hw of houseWords) {
        const sim = trigramSimilarity(w, hw);
        if (sim > wordBest) wordBest = sim;
        if (editDistanceAtMost(w, hw, typoTolerance(w)) <= typoTolerance(w)) {
          wordBest = Math.max(wordBest, 0.6);
        }
      }
      if (wordBest >= 0.5) {
        best = Math.max(best, wordBest);
        continue;
      }
      allWords = false;
      break;
    }
    if (allWords && words.length > 0) {
      houseById.set(house.id, { kind: "house-match", score: 500 + best * 100 });
    }
  }

  const scored: CatalogueHit[] = [];
  for (const row of fragranceRows) {
    const cloneCount = row.cloneCount;
    if (opts.withClonesOnly && cloneCount === 0) continue;
    const hit = scoreCandidate(row, raw, words, houseById.get(row.houseId));
    if (hit === null) continue;
    scored.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      house: row.houseName,
      houseSlug: row.houseSlug,
      year: row.year,
      pid: row.catalogueSourcePid,
      cloneCount,
      matchKind: hit.kind,
      score: hit.score,
    });
  }

  scored.sort((a, b) => {
    if (KIND_RANK[a.matchKind] !== KIND_RANK[b.matchKind]) {
      return KIND_RANK[a.matchKind] - KIND_RANK[b.matchKind];
    }
    if (b.score !== a.score) return b.score - a.score;
    return b.cloneCount - a.cloneCount;
  });

  return scored.slice(0, limit);
}

/**
 * Score one candidate against the query.
 *
 * The order of the tests IS the ranking, so the first one that passes
 * decides the label. Returns null when the candidate is not a match.
 */
function scoreCandidate(
  row: CandidateRow,
  raw: string,
  words: string[],
  houseMatch: { kind: MatchKind; score: number } | undefined,
): { kind: MatchKind; score: number } | null {
  const name = fold(row.name);
  const house = fold(row.houseName);
  const nameWords = name.split(" ");
  const houseWords = house.split(" ");
  const lengthPenalty = name.length * 0.1;

  // First: every word of the query has to land somewhere, in the name or
  // the house. A word is allowed to land approximately, which is what
  // makes a typo work, but a word that lands nowhere at all means this is
  // not a match. "sauvage nonexistent" finds nothing, even though
  // "sauvage" is in there.
  let allWords = true;
  let wordScore = 0;
  for (const w of words) {
    if (name.includes(w) || house.includes(w)) {
      wordScore = Math.max(wordScore, 1);
      continue;
    }
    let best = 0;
    const tolerance = typoTolerance(w);
    for (const candidate of [...nameWords, ...houseWords]) {
      const sim = trigramSimilarity(w, candidate);
      if (sim > best) best = sim;
      if (editDistanceAtMost(w, candidate, tolerance) <= tolerance) {
        best = Math.max(best, 0.6);
      }
    }
    if (best >= 0.5) {
      wordScore = Math.max(wordScore, best);
      continue;
    }
    allWords = false;
    break;
  }
  if (!allWords) return null;

  // Then: which kind of match is it.
  if (name === raw) return { kind: "exact-name", score: 1000 };
  if (name.startsWith(raw)) return { kind: "name-prefix", score: 900 - lengthPenalty };

  for (const w of words) {
    if (nameWords.some((nw) => nw.startsWith(w))) {
      return { kind: "word-prefix", score: 800 - lengthPenalty };
    }
  }

  if (
    houseMatch !== undefined &&
    (houseMatch.kind === "house-exact" || houseMatch.kind === "house-prefix")
  ) {
    return { kind: houseMatch.kind, score: houseMatch.score - lengthPenalty };
  }

  if (name.includes(raw)) return { kind: "name-contains", score: 600 - lengthPenalty };

  if (houseMatch !== undefined) {
    return { kind: houseMatch.kind, score: houseMatch.score - lengthPenalty };
  }
  if (house.includes(raw)) return { kind: "house-match", score: 550 - lengthPenalty };

  // Every word landed, but only approximately. That is a spelling.
  return { kind: "close-spelling", score: 400 + wordScore * 100 - lengthPenalty };
}
