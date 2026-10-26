// Single source of the closeness score for a clone pair (PRD section 7.6).
// Bucketed votes in, one deterministic rollup out. Floors default from
// floors.ts but stay caller-overridable for recalibration reviews.

import type { CensusBucket, CloneVotePair } from "./types";
import { floors } from "./floors";


export const BUCKET_VALUES: Record<CensusBucket, number> = {
  SPOT_ON: 95,
  CLOSE: 80,
  SIMILAR: 60,
  SAME_FAMILY: 35,
  NOT_CLOSE: 10,
};

export type RankLevel = "none" | "low" | "confident";

/** Human labels for the five buckets (product pages, vote buttons). The
 * words ARE the product honesty surface, so they live next to the buckets. */
export const BUCKET_LABELS: Record<CensusBucket, string> = {
  SPOT_ON: "Spot on",
  CLOSE: "Close",
  SIMILAR: "Similar",
  SAME_FAMILY: "Same family",
  NOT_CLOSE: "Not close",
};

export const RANK_LEVEL_LABELS: Record<RankLevel, string> = {
  none: "Unranked",
  low: "Low confidence",
  confident: "Confident",
};

export interface CensusRollup {
  sampleSize: number;
  score: number; // 0..100
  rankLevel: RankLevel;
  mostCommon: CensusBucket | null;
}

/** One vote per user per pair; a later vote replaces the earlier one. */
export function upsertCloneVote(votes: CloneVotePair[], vote: CloneVotePair): CloneVotePair[] {
  const filtered = votes.filter(
    (v) =>
      !(
        v.userId === vote.userId &&
        v.cloneId === vote.cloneId &&
        v.targetId === vote.targetId
      ),
  );
  return [...filtered, vote];
}

/** PRD 7.6: every vote is revisable, including un-voting a pair entirely. */
export function clearCloneVote(
  votes: CloneVotePair[],
  userId: string,
  cloneId: string,
  targetId: string,
): CloneVotePair[] {
  return votes.filter(
    (v) => !(v.userId === userId && v.cloneId === cloneId && v.targetId === targetId),
  );
}

export function rollupCensus(
  votes: CloneVotePair[],
  opts?: { lowVotes?: number; confidentVotes?: number },
): CensusRollup {
  const lowVotes = opts?.lowVotes ?? floors.census.lowConfidenceVotes;
  const confidentVotes = opts?.confidentVotes ?? floors.census.confidentVotes;

  if (votes.length === 0) {
    return { sampleSize: 0, score: 0, rankLevel: "none", mostCommon: null };
  }

  const counts = new Map<CensusBucket, number>();
  for (const v of votes) {
    counts.set(v.bucket, (counts.get(v.bucket) ?? 0) + 1);
  }
  // count wins; a count tie must not follow vote arrival order, so bucket
  // name (alphabetical, stable) decides. The same tie rule lets a caller
  // alphabetize "tied" clones deterministically (PRD 7.6 stable-order rule).
  const mostCommon = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];

  // The score is the average bucket value of all votes — spot on is 95,
  // close is 80, similar is 60, same family is 35, not close is 10. A single
  // close vote reads 80, not 100; the bar fills in proportion to how close
  // voters actually said it is.
  const score = Math.round(
    votes.reduce((sum, v) => sum + BUCKET_VALUES[v.bucket], 0) / votes.length,
  );
  const rankLevel: RankLevel =
    votes.length >= confidentVotes ? "confident" : votes.length >= lowVotes ? "low" : "none";

  return { sampleSize: votes.length, score, rankLevel, mostCommon };
}

/** Order two clone rollups; near-equal scores display as statistically tied.
 * "tied" (including two unranked clones) means the caller must produce a
 * stable order, which per PRD 7.6 is alphabetical by name. */
export function compareClones(
  a: CensusRollup,
  b: CensusRollup,
  opts?: { tieBand?: number },
): "a" | "b" | "tied" {
  const tieBand = opts?.tieBand ?? floors.census.tieBand;
  if (a.rankLevel === "none" && b.rankLevel === "none") return "tied";
  if (a.rankLevel === "none") return "b";
  if (b.rankLevel === "none") return "a";
  if (Math.abs(a.score - b.score) <= tieBand) return "tied";
  return a.score > b.score ? "a" : "b";
}
