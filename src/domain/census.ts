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

export interface CensusRollup {
  sampleSize: number;
  score: number; // 0..100, variable-weighted mean with trimmed outliers
  rankLevel: RankLevel;
  mostCommon: CensusBucket | null;
}

/** One vote per user per pair; a later vote replaces the earlier one. */
export function upsertCloneVote(votes: CloneVotePair[], vote: CloneVotePair): CloneVotePair[] {
  throw new Error("not implemented: upsertCloneVote");
}

export function rollupCensus(
  votes: CloneVotePair[],
  opts?: { lowVotes?: number; confidentVotes?: number },
): CensusRollup {
  throw new Error("not implemented: rollupCensus");
}

/** Order two clone rollups; near-equal scores display as statistically tied. */
export function compareClones(
  a: CensusRollup,
  b: CensusRollup,
  opts?: { tieBand?: number },
): "a" | "b" | "tied" {
  throw new Error("not implemented: compareClones");
}

// keep floors imported so the defaults stay wired (lint cleanliness pre-impl)
void floors;
