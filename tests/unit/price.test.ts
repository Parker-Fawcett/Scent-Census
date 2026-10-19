import { describe, expect, it } from "vitest";
import { estimateFragrancePrice } from "@/domain/price";
import type { PriceCapture } from "@/domain/types";

const NOW = new Date("2026-10-19T12:00:00Z");

function point(priceCents: number, minutesAgo: number): PriceCapture {
  return {
    fragranceId: "f",
    source: "EBAY_ASKING",
    priceCents,
    capturedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    sizeMl: 100,
  };
}

describe("estimateFragrancePrice", () => {
  it("returns none for zero points and for all-stale points", () => {
    expect(estimateFragrancePrice([], { now: NOW })).toMatchObject({
      status: "none",
      lowCents: null,
      midCents: null,
      highCents: null,
      sampleSize: 0,
    });

    const staleOnly = point(5000, 31 * 24 * 60); // 31 days old
    expect(estimateFragrancePrice([staleOnly], { now: NOW })).toMatchObject({ status: "none" });
  });

  it("never invents numbers: stale points are excluded, not blended", () => {
    const fresh = point(5000, 60);
    const ancient = point(990_000, 90 * 24 * 60);
    // default floor applies: one fresh point is real data, but thin
    const estimate = estimateFragrancePrice([fresh, ancient], { now: NOW });
    expect(estimate.sampleSize).toBe(1);
    expect(estimate).toMatchObject({ status: "thin", lowCents: 5000, highCents: 5000 });
  });

  it("labels sub-floor samples thin but still shows a range", () => {
    const points = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map((c, i) =>
      point(c, i + 1),
    );
    const estimate = estimateFragrancePrice(points, { now: NOW, minSample: 12 });
    expect(estimate.status).toBe("thin");
    expect(estimate.lowCents).toBe(1000);
    expect(estimate.highCents).toBe(8000);
    expect(estimate.midCents).toBe(4500);
    expect(estimate.sampleSize).toBe(8);
  });

  it("labels at-or-above-floor samples confident", () => {
    const points = Array.from({ length: 12 }, (_, i) => point(1000 + i * 100, i + 1));
    const estimate = estimateFragrancePrice(points, { now: NOW, minSample: 12 });
    expect(estimate.status).toBe("confident");
    expect(estimate.sampleSize).toBe(12);
  });

  it("trims outliers off both tails before summarizing (10 values)", () => {
    // 8 honest readings at 5000, one junk low and one junk high
    const mine = [10, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 10_000].map((c, i) =>
      point(c, i + 1),
    );
    const estimate = estimateFragrancePrice(mine, { now: NOW, minSample: 12 });
    // sorted: junk 10 first, junk 10000 last; one trim per side leaves 8 × 5000
    expect(estimate).toMatchObject({
      status: "thin",
      lowCents: 5000,
      midCents: 5000,
      highCents: 5000,
    });
  });

  it("honors custom staleness windows for recalibration", () => {
    const oldish = point(5000, 20 * 24 * 60); // 20 days
    const estimate = estimateFragrancePrice([oldish], { now: NOW, staleDays: 10, minSample: 1 });
    expect(estimate.status).toBe("none");
  });
});
