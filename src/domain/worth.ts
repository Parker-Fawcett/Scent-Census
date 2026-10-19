// Shelf worth (PRD section 7.2): every bottle gets an estimate only from
// a group that matches its OWN size and the worth source; totals are honest
// sums with an explicit "how many bottles have market data" count, and the
// delta is total mid minus cost basis. Never a pokedex, never a blended
// cross-size number, never an invented estimate for a bottle we cannot price.

import type { GroupedEstimate } from "./marketSources";
import type { EstimateStatus } from "./price";
import { floors } from "./floors";

export interface ShelfItem {
  itemId: string;
  sizeMl: number | null;
  pricePaidCents: number | null;
}

export interface ShelfFragranceInput {
  items: ShelfItem[];
  /** grouped, already-fresh estimates for THIS fragrance, from one source */
  groups: GroupedEstimate[];
}

export interface BottleWorth {
  itemId: string;
  status: EstimateStatus;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
}

export interface WorthRange {
  low: number;
  mid: number;
  high: number;
}

export interface ShelfSummary {
  bottles: BottleWorth[];
  /** null when not a single bottle has market data */
  totalWorthCents: WorthRange | null;
  /** sum of entered purchase prices; null when none were entered */
  costBasisCents: number | null;
  /** total mid worth minus cost basis; null when either side is unknown */
  deltaCents: number | null;
  bottlesWithMarket: number;
  bottlesTotal: number;
}

function bottleWorth(item: ShelfItem, groups: GroupedEstimate[]): BottleWorth {
  const match =
    groups.find(
      (g) =>
        g.source === floors.worth.source &&
        g.sizeMl === item.sizeMl &&
        g.estimate.status !== "none",
    ) ?? null;
  if (!match) {
    return {
      itemId: item.itemId,
      status: "none",
      lowCents: null,
      midCents: null,
      highCents: null,
    };
  }
  return {
    itemId: item.itemId,
    status: match.estimate.status,
    lowCents: match.estimate.lowCents,
    midCents: match.estimate.midCents,
    highCents: match.estimate.highCents,
  };
}

export function shelfWorth(shelf: ShelfFragranceInput[]): ShelfSummary {
  const bottles = shelf.flatMap((entry) => entry.items.map((item) => bottleWorth(item, entry.groups)));

  const priced = bottles.filter((b) => b.midCents !== null);
  const totalWorthCents: WorthRange | null =
    priced.length === 0
      ? null
      : {
          low: priced.reduce((s, b) => s + (b.lowCents ?? 0), 0),
          mid: priced.reduce((s, b) => s + (b.midCents ?? 0), 0),
          high: priced.reduce((s, b) => s + (b.highCents ?? 0), 0),
        };

  const costItems = shelf
    .flatMap((entry) => entry.items.map((item) => item.pricePaidCents))
    .filter((cents): cents is number => cents !== null);
  const costBasisCents = costItems.length === 0 ? null : costItems.reduce((s, c) => s + c, 0);

  const deltaCents =
    totalWorthCents === null || costBasisCents === null
      ? null
      : totalWorthCents.mid - costBasisCents;

  return {
    bottles,
    totalWorthCents,
    costBasisCents,
    deltaCents,
    bottlesWithMarket: priced.length,
    bottlesTotal: bottles.length,
  };
}
