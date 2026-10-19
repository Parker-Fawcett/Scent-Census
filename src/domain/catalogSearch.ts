// Search over the catalogue (PRD section 7.1 acceptance criteria: the famous
// seed must get found instantly). Pure function over in-memory records;
// ranking is exact name, then prefix, then substring, then house match.

import type { CatalogFragrance } from "./types";

export type MatchKind = "exact-name" | "name-prefix" | "name-contains" | "house";

export interface CatalogHit {
  fragrance: CatalogFragrance;
  matchKind: MatchKind;
}

export function searchCatalog(
  items: CatalogFragrance[],
  query: string,
  opts?: { limit?: number },
): CatalogHit[] {
  throw new Error("not implemented: searchCatalog");
}
