// Price honesty contract, PRD section 8 rule 2: ONE function computes
// estimates. Trimmed mean over fresh points, declared minimum sample, range
// always, staleness honored via staleness.ts, and contamination refused:
// callers must hand this function ONE source and ONE bottle size, because a
// blended mean of MSRP and asking prices (or of 30ml and 100ml asks) is a
// confidently wrong number, which is the one thing this contract exists to
// prevent.

import type { PriceCapture } from "./types";
import { isStale } from "./staleness";
import { floors } from "./floors";

export type EstimateStatus = "confident" | "thin" | "none";

export interface PriceEstimate {
  status: EstimateStatus;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  /** count of fresh points sampled (before trimming) */
  sampleSize: number;
}

export function estimateFragrancePrice(
  points: PriceCapture[],
  opts: { now: Date; staleDays?: number; minSample?: number },
): PriceEstimate {
  const staleDays = opts.staleDays ?? floors.price.staleDays;
  const minSample = opts.minSample ?? floors.price.minSample;

  if (new Set(points.map((p) => p.source)).size > 1) {
    throw new Error(
      "price honesty: mixing sources contaminates the trimmed mean (PRD 8); group by source before estimating",
    );
  }
  if (new Set(points.map((p) => p.sizeMl)).size > 1) {
    throw new Error(
      "price honesty: mixing bottle sizes contaminates the range (PRD 8); group by size before estimating",
    );
  }

  const fresh = points.filter(
    (p) => p.priceCents > 0 && !isStale(p.capturedAt, opts.now, staleDays),
  );
  if (fresh.length === 0) {
    return { status: "none", lowCents: null, midCents: null, highCents: null, sampleSize: 0 };
  }

  const sorted = fresh.map((p) => p.priceCents).sort((a, b) => a - b);

  // trim 10% from each tail, only with enough data to survive it (below 10
  // points the tails are the most honest information we have)
  let trimmed = sorted;
  if (sorted.length >= 10) {
    const k = Math.max(1, Math.floor(sorted.length * 0.1));
    trimmed = sorted.slice(k, sorted.length - k);
  }

  const low = trimmed[0];
  const high = trimmed[trimmed.length - 1];
  const mid = Math.round(trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length);

  return {
    status: sorted.length >= minSample ? "confident" : "thin",
    lowCents: low,
    midCents: mid,
    highCents: high,
    sampleSize: sorted.length,
  };
}
