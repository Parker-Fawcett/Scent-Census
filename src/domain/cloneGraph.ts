/**
 * When does a public "reminds me of" poll count as a clone relationship?
 *
 * The old rule was a hard 60% agreement floor. It was measured against 34
 * hand-curated clone pairs, all of which sit at 74% or better, so it looked
 * safe. It was not: Marwa by Arabiyat Prestige carries 1,578 votes saying it
 * reminds people of Louis Vuitton Imagination, 883 of them yes (56%), and
 * the floor threw the edge away. Imagination's page then had no Marwa, and
 * Inception, which points at Marwa, had no visible original at all.
 *
 * A hard share is the wrong test for a poll. A 56% result from 1,578 voters
 * is a real majority; a 56% result from 25 voters is a coin flip. The
 * Wilson lower bound answers the question the page actually asks: is there
 * enough evidence that more people said yes than no?
 *
 * The rule now keeps every pair that clears the old 60% floor, and adds a
 * pair only when the Wilson 95% lower bound is above 50%. That is a
 * one-sided statistical test, not a lower editorial bar for small samples.
 */

/** Wilson score interval lower bound for a binomial share. */
export function wilsonLowerBound(yes: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = yes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (centre - margin) / denominator;
}

/**
 * Keep the historical 60% agreement edges, plus any pair whose measured
 * majority is statistically real. The caller applies the minimum vote
 * floors before this; this function only judges agreement.
 */
export function passesAgreementFloor(
  upVotes: number,
  downVotes: number,
  strictFloor = 0.6,
): boolean {
  const total = upVotes + downVotes;
  if (total <= 0) return false;
  if (upVotes / total >= strictFloor) return true;
  return wilsonLowerBound(upVotes, total) >= 0.5;
}
