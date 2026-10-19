// Price honesty contract, PRD section 8 rule 2: ONE function computes
// estimates. Trimmed mean over fresh points, declared minimum sample,
// range always (never a lone figure), and staleness honored via staleness.ts.

import type { PriceCapture } from "./types";
import { isStale } from "./staleness";
import { floors } from "./floors";

export type EstimateStatus = "confident" | "thin" | "none";

export interface PriceEstimate {
  status: EstimateStatus;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  /** count of fresh points actually used */
  sampleSize: number;
}

export function estimateFragrancePrice(
  points: PriceCapture[],
  opts: { now: Date; staleDays?: number; minSample?: number },
): PriceEstimate {
  throw new Error("not implemented: estimateFragrancePrice");
}

void floors;
