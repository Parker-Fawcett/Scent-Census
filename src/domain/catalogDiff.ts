// Catalogue release diff (PRD section 7.7 signal 1): consecutive FragDB
// refreshes arrive as snapshots; new records per house are "drop" events.
// Pure function, idempotent by pid. Renames are not additions because the pid
// is the identity (that is what makes the follow stream double-fire-proof).

import type { ReleaseRecord } from "./types";

export interface ReleaseDiff {
  /** pids present in next and not in prev (Rasasi dropped a new Hawas) */
  added: ReleaseRecord[];
  /** pids in prev and missing from next (keep last-known content, flag it) */
  removed: ReleaseRecord[];
}

function assertSnapshotUnique(records: ReleaseRecord[], side: string): void {
  if (new Set(records.map((r) => r.pid)).size !== records.length) {
    throw new Error(
      `release diff: duplicate pid in ${side} snapshot; an ingest or export is broken (PRD 7.7)`,
    );
  }
}

export function diffReleases(prev: ReleaseRecord[], next: ReleaseRecord[]): ReleaseDiff {
  assertSnapshotUnique(prev, "previous");
  assertSnapshotUnique(next, "next");
  const prevIds = new Set(prev.map((r) => r.pid));
  const nextIds = new Set(next.map((r) => r.pid));
  return {
    added: next.filter((r) => !prevIds.has(r.pid)),
    removed: prev.filter((r) => !nextIds.has(r.pid)),
  };
}
