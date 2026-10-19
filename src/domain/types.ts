// Types shared by the domain modules. Catalogue records mirror the PRD-v1
// section 9 model without any storage assumptions.

export type HouseTier = "DESIGNER" | "NICHE" | "CLONE" | "MASS_MARKET";

export interface CatalogHouse {
  id: string;
  name: string;
  slug: string;
  tier: HouseTier;
}

export interface CatalogFragrance {
  id: string;
  slug: string;
  name: string;
  house: CatalogHouse;
  year: number | null;
  // clone-of edge (PRD section 9); null for originals
  inspiredById: string | null;
  noteNames: string[];
  accordNames: string[];
}

export type PriceSource = "EBAY_ASKING" | "RETAIL_FEED";

export interface PriceCapture {
  fragranceId: string;
  source: PriceSource;
  priceCents: number;
  capturedAt: string; // ISO timestamp
  sizeMl: number | null;
}

export type CensusBucket = "SPOT_ON" | "CLOSE" | "SIMILAR" | "SAME_FAMILY" | "NOT_CLOSE";

export interface CloneVotePair {
  userId: string;
  cloneId: string;
  targetId: string;
  bucket: CensusBucket;
}

/** One record of a catalogue release snapshot (FragDB refresh). */
export interface ReleaseRecord {
  pid: string; // stable catalogue id, survives renames
  houseId: string;
  name: string;
}
