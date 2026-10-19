// Shelf worth (PRD section 7.2): every bottle gets an estimate only from a
// group that matches its OWN size and the worth source; totals are honest
// sums with an explicit "how many bottles have market data" count, and the
// delta is total mid minus cost basis. Never a pokedex, never a blended
// cross-size number, never an invented estimate for a bottle we cannot price.

import { describe, expect, it } from "vitest";
import { shelfWorth, type ShelfFragranceInput } from "@/domain/worth";
import type { GroupedEstimate } from "@/domain/marketSources";

const group = (over: Partial<GroupedEstimate> = {}): GroupedEstimate => ({
  source: "EBAY_ASKING",
  sizeMl: 100,
  estimate: { status: "thin", lowCents: 10000, midCents: 15000, highCents: 20000, sampleSize: 7 },
  ...over,
});

const shelf = (over: Partial<ShelfFragranceInput>): ShelfFragranceInput => ({
  items: [],
  groups: [],
  ...over,
});

describe("shelfWorth", () => {
  it("summarizes an empty shelf as zero bottles and nothing priced", () => {
    expect(shelfWorth([])).toEqual({
      bottles: [],
      totalWorthCents: null,
      costBasisCents: null,
      deltaCents: null,
      bottlesWithMarket: 0,
      bottlesTotal: 0,
    });
  });

  it("prices a bottle from its OWN size group", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "b1", sizeMl: 100, pricePaidCents: null }],
        groups: [group()],
      }),
    ]);
    expect(summary.bottles).toHaveLength(1);
    expect(summary.bottles[0].status).toBe("thin");
    expect(summary.bottles[0].lowCents).toBe(10000);
    expect(summary.totalWorthCents).toEqual({ low: 10000, mid: 15000, high: 20000 });
    expect(summary.bottlesWithMarket).toBe(1);
    expect(summary.bottlesTotal).toBe(1);
  });

  it("never borrows across sizes or prices 30ml with 100ml asks", () => {
    const summary = shelfWorth([
      shelf({
        items: [
          { itemId: "b1", sizeMl: 50, pricePaidCents: null },
          { itemId: "b2", sizeMl: 100, pricePaidCents: null },
        ],
        groups: [group()],
      }),
    ]);
    const b1 = summary.bottles.find((b) => b.itemId === "b1");
    expect(b1?.status).toBe("none");
    expect(b1?.midCents).toBeNull();
    expect(summary.bottlesWithMarket).toBe(1);
    expect(summary.totalWorthCents).toEqual({ low: 10000, mid: 15000, high: 20000 });
  });

  it("does not fill unknown-size bottles from other size groups either", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "b1", sizeMl: null, pricePaidCents: null }],
        groups: [group({ sizeMl: 100 }), group({ sizeMl: null })],
      }),
    ]);
    expect(summary.bottles[0].status).toBe("thin");
  });

  it("uses the asking source only for worth (RETAIL_FEED is a different contract)", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "b1", sizeMl: 100, pricePaidCents: null }],
        groups: [group({ source: "RETAIL_FEED" })],
      }),
    ]);
    expect(summary.bottles[0].status).toBe("none");
    expect(summary.totalWorthCents).toBeNull();
  });

  it("carries status through: confident bottles label confident", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "b1", sizeMl: 100, pricePaidCents: null }],
        groups: [
          group({
            estimate: { status: "confident", lowCents: 10000, midCents: 15000, highCents: 20000, sampleSize: 20 },
          }),
        ],
      }),
    ]);
    expect(summary.bottles[0].status).toBe("confident");
  });

  it("aggregates across fragrances: range sums are straight sums", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "a", sizeMl: 100, pricePaidCents: null }],
        groups: [group()],
      }),
      shelf({
        items: [{ itemId: "b", sizeMl: 30, pricePaidCents: null }],
        groups: [group({ sizeMl: 30, estimate: { status: "confident", lowCents: 8000, midCents: 9000, highCents: 11000, sampleSize: 25 } })],
      }),
    ]);
    expect(summary.totalWorthCents).toEqual({ low: 18000, mid: 24000, high: 31000 });
    expect(summary.bottlesWithMarket).toBe(2);
  });

  it("cost basis skips unpriced bottles; delta counts only cost we know", () => {
    const summary = shelfWorth([
      shelf({
        items: [
          { itemId: "a", sizeMl: 100, pricePaidCents: 9000 },
          { itemId: "b", sizeMl: 50, pricePaidCents: null },
        ],
        groups: [group()],
      }),
    ]);
    expect(summary.costBasisCents).toBe(9000);
    expect(summary.deltaCents).toBe(15000 - 9000);
  });

  it("totals stand without cost entries: delta stays null", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "a", sizeMl: 100, pricePaidCents: null }],
        groups: [group()],
      }),
    ]);
    expect(summary.costBasisCents).toBeNull();
    expect(summary.deltaCents).toBeNull();
    expect(summary.totalWorthCents).toEqual({ low: 10000, mid: 15000, high: 20000 });
  });

  it("zero market data anywhere: worth stays null, plain and total", () => {
    const summary = shelfWorth([
      shelf({
        items: [{ itemId: "a", sizeMl: 100, pricePaidCents: 5000 }],
        groups: [group()],
      }),
      shelf({
        items: [{ itemId: "b", sizeMl: 999, pricePaidCents: 6000 }],
        groups: [],
      }),
    ]);
    expect(summary.bottles.every((b) => b.status === "none")).toBe(true);
    expect(summary.totalWorthCents).toBeNull();
    expect(summary.deltaCents).toBeNull();
    expect(summary.costBasisCents).toBe(11000);
    expect(summary.bottlesWithMarket).toBe(0);
  });
});
