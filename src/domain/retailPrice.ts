// Retail price reads, sized.
//
// The comparison the site cares about is "what does the 100ml bottle cost",
// because clone houses standardize on 100ml (3.4oz) and that is the size
// people actually buy. A capture is only comparable if its size is near
// 100ml, and a price without its size is a price nobody can act on.
//
// HONESTY RULES:
//   - the size is always shown with the price;
//   - a fragrance with no comparable-size capture shows "no confident price",
//     never the 2ml sample price;
//   - captures are asking prices at a named source, never sold prices;
//   - the source name is shown, because "a price" without a source is a
//     rumor.

export const COMPARABLE_SIZE_ML = 100;

/** how far from 100ml a capture can be and still be comparable */
export const SIZE_TOLERANCE_ML = 25;

export interface PriceRead {
  lowCents: number;
  highCents: number;
  sizeMl: number | null;
  sourceCount: number;
  /** the cheapest single capture, with its size */
  cheapestCents: number | null;
  cheapestSizeMl: number | null;
  capturedAt: Date;
  /** the size the captures are shown at: the standard bottle when there is
      one, otherwise the size of the cheapest capture */
  displaySizeMl: number | null;
}

export interface RawCapture {
  priceCents: number;
  sizeMl: number | null;
  capturedAt: Date;
}

/**
 * Reduce raw captures to one comparable read.
 *
 * Only captures near 100ml count. Among those, the range spans what the
 * sources ask, and the cheapest single capture is the honest floor.
 */
export function readPrice(captures: RawCapture[]): PriceRead | null {
  const comparable = captures.filter(
    (c) => c.sizeMl !== null && Math.abs(c.sizeMl - COMPARABLE_SIZE_ML) <= SIZE_TOLERANCE_ML,
  );
  if (comparable.length === 0) return null;

  const prices = comparable.map((c) => c.priceCents).sort((a, b) => a - b);
  const cheapest = comparable.reduce((best, c) => (c.priceCents < best.priceCents ? c : best));

  // when a capture exists at the standard bottle size, that is the size we
  // quote, because it is the bottle people buy
  const standard = comparable.find((c) => c.sizeMl === COMPARABLE_SIZE_ML);

  return {
    lowCents: prices[0],
    highCents: prices[prices.length - 1],
    sizeMl: cheapest.sizeMl,
    sourceCount: new Set(comparable.map((c) => c.capturedAt.getTime())).size,
    cheapestCents: cheapest.priceCents,
    cheapestSizeMl: cheapest.sizeMl,
    capturedAt: comparable.reduce((latest, c) => (c.capturedAt > latest.capturedAt ? c : latest)).capturedAt,
    displaySizeMl: standard !== undefined ? standard.sizeMl : cheapest.sizeMl,
  };
}

/** "from $31 at 3.4oz" style read for the UI. */
export function formatPriceRead(read: PriceRead | null): string {
  if (read === null) return "no confident price";
  const dollars = (cents: number): string => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
  const size = read.displaySizeMl !== null ? ` at ${read.displaySizeMl}ml` : "";
  if (read.lowCents === read.highCents) {
    return `${dollars(read.lowCents)}${size}`;
  }
  return `${dollars(read.lowCents)}-${dollars(read.highCents)}${size}`;
}

/**
 * How much less the copy costs than the original, as a ratio.
 * Returns null when either side has no comparable price.
 */
export function savingsRatio(copyCents: number | null, originalCents: number | null): number | null {
  if (copyCents === null || originalCents === null) return null;
  if (copyCents <= 0 || originalCents <= 0) return null;
  if (copyCents >= originalCents) return null;
  return originalCents / copyCents;
}

export function formatSavings(ratio: number | null): string {
  if (ratio === null) return "";
  if (ratio >= 10) return `${Math.round(ratio)}x cheaper`;
  if (ratio >= 2) return `${ratio.toFixed(1)}x cheaper`;
  return "cheaper";
}
