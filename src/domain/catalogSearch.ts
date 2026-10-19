/** Search over the catalogue (PRD section 7.1 acceptance criteria: the famous
 * seed must get found instantly). Pure function over in-memory records;
 * ranking is exact name, then prefix, then substring, then house match.
 * Diacritics fold on both sides so "celine" finds "Céline". */

import type { CatalogFragrance } from "./types";

export type MatchKind = "exact-name" | "name-prefix" | "name-contains" | "house";

export interface CatalogHit {
  fragrance: CatalogFragrance;
  matchKind: MatchKind;
}

function fold(s: string): string {
  // strip diacritics (NFD combining marks), then lowercase
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function kindOf(name: string, house: string, q: string): MatchKind | null {
  if (name === q) return "exact-name";
  if (name.startsWith(q)) return "name-prefix";
  if (name.includes(q)) return "name-contains";
  if (house.includes(q)) return "house";
  return null;
}

const KIND_RANK: Record<MatchKind, number> = {
  "exact-name": 0,
  "name-prefix": 1,
  "name-contains": 2,
  house: 3,
};

export function searchCatalog(
  items: CatalogFragrance[],
  query: string,
  opts?: { limit?: number },
): CatalogHit[] {
  const q = fold(query);
  if (!q) return [];
  const limit = opts?.limit ?? 20;

  const hits: CatalogHit[] = [];
  for (const fragrance of items) {
    const kind = kindOf(
      fold(fragrance.name),
      fold(fragrance.house.name),
      q,
    );
    if (kind) hits.push({ fragrance, matchKind: kind });
  }

  return hits.sort((x, y) => KIND_RANK[x.matchKind] - KIND_RANK[y.matchKind]).slice(0, limit);
}
