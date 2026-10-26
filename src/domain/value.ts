// Price perception, the buying signal.
//
// The catalogue carries no dollar prices (the eBay capture never ran), but
// the corpus does carry a community vote on how overpriced each fragrance is:
// price_value, 1 = way overpriced, 5 = great value. That is a RELATIVE
// measure, and it is exactly what a clone comparison needs, because a clone
// exists because it is cheaper.
//
// The gap between the two sides says how much cheaper the copy reads:
//   4.32 (CDNIM) vs 1.69 (Aventus) = 2.63 -> the copy reads far cheaper
//
// The wording is deliberately about VALUE, not price, because that is what
// the vote measured. Nobody here has told us what a bottle costs.

export type ValueBand = "way-overpriced" | "overpriced" | "ok" | "good-value" | "great-value";

const BANDS: Array<{ max: number; band: ValueBand; label: string }> = [
  { max: 1.5, band: "way-overpriced", label: "way overpriced" },
  { max: 2.5, band: "overpriced", label: "overpriced" },
  { max: 3.5, band: "ok", label: "fair price" },
  { max: 4.2, band: "good-value", label: "good value" },
  { max: 5.1, band: "great-value", label: "great value" },
];

export function valueBand(score: number): ValueBand {
  for (const b of BANDS) {
    if (score <= b.max) return b.band;
  }
  return "great-value";
}

export function valueLabel(score: number): string {
  for (const b of BANDS) {
    if (score <= b.max) return b.label;
  }
  return "great value";
}

/**
 * How much cheaper the copy reads compared with the original.
 * Returns null when either side has no vote, because a gap against a missing
 * number would be a made-up number.
 */
export function valueGap(cloneValue: number | null, originalValue: number | null): number | null {
  if (cloneValue === null || originalValue === null) return null;
  return cloneValue - originalValue;
}

/**
 * Plain-language read of the gap.
 *
 * The scale runs 1 (way overpriced) to 5 (great value), so a gap of 2 means
 * "reads twice as far from overpriced toward great value". The bands are
 * deliberately blunt because a reader should not have to do arithmetic.
 */
export function gapLabel(gap: number): string {
  if (gap >= 2) return "reads far cheaper than the original";
  if (gap >= 1.2) return "reads cheaper than the original";
  if (gap >= 0.6) return "reads a little cheaper";
  if (gap >= 0.2) return "reads about the same";
  return "reads about the same";
}
