// Catalogue release diff (PRD section 7.7 signal 1): consecutive FragDB
// refreshes arrive as snapshots; new records per house are "drop" events.
// Pure function, idempotent by pid.

import type { ReleaseRecord } from "./types";

export interface ReleaseDiff {
  /** pids present in next and not in prev (Rasasi dropped a new Hawas) */
  added: ReleaseRecord[];
  /** pids in prev and missing from next (keep last-known content, flag it) */
  removed: ReleaseRecord[];
}

export function diffReleases(prev: ReleaseRecord[], next: ReleaseRecord[]): ReleaseDiff {
  throw new Error("not implemented: diffReleases");
}
