// Contract tests for the market-source seam (PRD section 8 rule 4): real
// pricing data arrives through MarketSource; the fake exists for tests and
// demo envs and is deterministic by contract. estimateFromSource is what
// keeps contamination impossible at the seam: captures group by
// (source, sizeMl) BEFORE the price honesty function sees them, so sibling
// groups can never inflate each other's sample or blend a range.

import { describe, expect, it } from "vitest";
import {
  estimateFromSource,
  fakeMarketSource,
} from "@/domain/marketSources";
import type { PriceCapture } from "@/domain/types";

const NOW = new Date("2026-10-19T12:00:00.000Z");

const capture = (over: Partial<PriceCapture> = {}): PriceCapture => ({
  fragranceId: "f1",
  source: "EBAY_ASKING",
  priceCents: 10000,
  capturedAt: NOW.toISOString(),
  sizeMl: 100,
  ...over,
});

const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("fakeMarketSource", () => {
  it("returns exactly the fixtures it was given and nothing invented", () => {
    const source = fakeMarketSource({ f1: [capture()] });
    expect(source.pointsFor("f1")).toEqual([capture()]);
    expect(source.pointsFor("missing")).toEqual([]);
    expect(source.pointsFor("f2")).toEqual([]);
  });

  it("is deterministic: same fixtures, same points out", () => {
    const fixtures = { f1: [capture(), capture({ sizeMl: 50 })] };
    expect(fakeMarketSource(fixtures).pointsFor("f1")).toEqual(
      fakeMarketSource(fixtures).pointsFor("f1"),
    );
  });
});

describe("estimateFromSource", () => {
  it("yields no groups for an unknown fragrance", () => {
    expect(estimateFromSource(fakeMarketSource({}), "f1", { now: NOW })).toEqual([]);
  });

  it("produces one estimate per (source, size) group without contamination", () => {
    const source = fakeMarketSource({
      f1: [
        capture(), // EBAY 100
        capture({ source: "RETAIL_FEED" }), // RETAIL 100
        capture({ sizeMl: 50 }), // EBAY 50
        capture({ sizeMl: null }), // EBAY unknown size
      ],
    });
    const groups = estimateFromSource(source, "f1", { now: NOW });
    expect(groups).toHaveLength(4);
    expect(
      [...groups].every((g) => g.estimate.sampleSize === 1 && g.estimate.status === "thin"),
    ).toBe(true);
    expect(
      [...groups].every(
        (g) => g.estimate.lowCents === 10000 && g.estimate.highCents === 10000,
      ),
    ).toBe(true);
  });

  it("orders groups deterministically by source, then size, unknown sizes last", () => {
    const source = fakeMarketSource({
      f1: [
        capture({ sizeMl: null }),
        capture({ sizeMl: 100 }),
        capture({ sizeMl: 50 }),
        capture({ source: "RETAIL_FEED" }),
      ],
    });
    const keys = estimateFromSource(source, "f1", { now: NOW }).map(
      (g) => `${g.source}:${g.sizeMl}`,
    );
    expect(keys).toEqual([
      "EBAY_ASKING:50",
      "EBAY_ASKING:100",
      "EBAY_ASKING:null",
      "RETAIL_FEED:100",
    ]);
  });

  it("never lets sibling groups inflate each other's sample", () => {
    // 11 fresh 100ml captures + 11 fresh 50ml captures + 11 fresh retail:
    // anyone blending would call 33 data points "confident". None of them is.
    const many = (sizeMl: number | null, over: Partial<PriceCapture> = {}): PriceCapture[] =>
      Array.from({ length: 11 }, () => capture({ sizeMl, ...over }));
    const source = fakeMarketSource({
      f1: [
        ...many(100),
        ...many(50),
        ...many(100, { source: "RETAIL_FEED" }),
      ],
    });
    const groups = estimateFromSource(source, "f1", { now: NOW });
    expect(groups).toHaveLength(3);
    expect(
      [...groups].every((g) => g.estimate.status === "thin" && g.estimate.sampleSize === 11),
    ).toBe(true);
  });

  it("labels a group confident once its OWN 12th fresh point arrives", () => {
    const source = fakeMarketSource({
      f1: [
        ...Array.from({ length: 12 }, () => capture({ sizeMl: 100 })),
        ...Array.from({ length: 11 }, () => capture({ sizeMl: 50 })),
      ],
    });
    const groups = estimateFromSource(source, "f1", { now: NOW });
    expect(groups.find((g) => g.sizeMl === 100).estimate.status).toBe("confident");
    expect(groups.find((g) => g.sizeMl === 50).estimate.status).toBe("thin");
  });

  it("keeps stale captures out of their group's count", () => {
    const source = fakeMarketSource({
      f1: [
        ...Array.from({ length: 11 }, () => capture()),
        ...Array.from({ length: 20 }, () => capture({ capturedAt: daysAgo(31) })),
      ],
    });
    const groups = estimateFromSource(source, "f1", { now: NOW });
    expect(groups).toHaveLength(1);
    expect(groups[0].estimate.status).toBe("thin");
    expect(groups[0].estimate.sampleSize).toBe(11);
  });
});
