// Market source seam and the fake (PRD section 8 rule 4): real pricing data
// enters through the MarketSource interface; the fake is constructed only in
// tests and demo environments and is deterministic by contract, no randomness,
// ever. estimateFromSource applies the contamination discipline from price.ts
// for the caller: it groups captures by (source, sizeMl) and estimates each
// group separately, so a mixed source / mixed size dump still produces
// honest per-group ranges instead of one blended wrong number.

import type { PriceCapture, PriceSource } from "./types";
import { estimateFragrancePrice, type PriceEstimate } from "./price";

export interface MarketSource {
  pointsFor(fragranceId: string): PriceCapture[];
}

export interface GroupedEstimate {
  source: PriceSource;
  /** null when the captures did not carry a bottle size */
  sizeMl: number | null;
  estimate: PriceEstimate;
}

/** For tests and demo environments only. Deterministic: same fixtures in,
 * same points out. Construction anywhere else is the leak the PRD forbids. */
export function fakeMarketSource(fixtures: Record<string, PriceCapture[]>): MarketSource {
  return { pointsFor: (fragranceId) => fixtures[fragranceId] ?? [] };
}

function groupKey(p: PriceCapture): string {
  return `${p.source}|${p.sizeMl === null ? "-" : p.sizeMl}`;
}

export function estimateFromSource(
  source: MarketSource,
  fragranceId: string,
  opts: { now: Date },
): GroupedEstimate[] {
  const groups = new Map<string, PriceCapture[]>();
  for (const point of source.pointsFor(fragranceId)) {
    const key = groupKey(point);
    const existing = groups.get(key);
    if (existing) existing.push(point);
    else groups.set(key, [point]);
  }
  const out: GroupedEstimate[] = [];
  for (const [key, points] of groups) {
    const [sourceName, sizeRaw] = key.split("|");
    out.push({
      source: sourceName as PriceSource,
      sizeMl: sizeRaw === "-" ? null : Number(sizeRaw),
      estimate: estimateFragrancePrice(points, opts),
    });
  }
  return out.sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      (a.sizeMl ?? Number.POSITIVE_INFINITY) - (b.sizeMl ?? Number.POSITIVE_INFINITY),
  );
}
