// Census curation, part 1: candidate selection from the corpus's community
// reminds_me_of votes. See the test file for the contract. The second half of
// this work (approval) lives in src/server/curation.ts: candidates propose,
// a human approves, and only the approved file can move a fragrance's
// inspiredById edge.

export interface RemindsCandidate {
  fid: number;
  cloneName: string;
  cloneBrand: string;
  targetFid: number;
  targetName: string;
  targetBrand: string;
  up: number;
  down: number;
  net: number;
  disputed: boolean;
}

export interface CorpusRowInput {
  fid: number;
  slug: string;
  brand: string;
  name: string;
  reminds: {
    targetFid: number;
    targetBrand: string;
    targetName: string;
    up: number;
    down: number;
  }[];
}

/** A community net must reach this before the edge is worth a curator's
 * attention. Below it, signal is a rounding error at 140k-scale corpus. */
export const NET_PAUSE_FLOOR = 100;

/** Fragrantica's dump slugifies brand display names the same way our House
 * import does (lowercase, non-alphanumeric to single dashes). */
export function houseSlugFor(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function rankCloneCandidates(
  rows: CorpusRowInput[],
  opts: { cloneHouseSlugs: Set<string>; netFloor?: number },
): RemindsCandidate[] {
  const netFloor = opts.netFloor ?? NET_PAUSE_FLOOR;
  const candidates: RemindsCandidate[] = [];

  for (const row of rows) {
    if (!opts.cloneHouseSlugs.has(houseSlugFor(row.brand))) continue;
    for (const reminds of row.reminds) {
      // a census edge points at the original: a clone-house target is either
      // a flanker of the same cope or another clone, both out of scope; and
      // nothing may remind of itself by id
      if (opts.cloneHouseSlugs.has(houseSlugFor(reminds.targetBrand))) continue;
      if (reminds.targetFid === row.fid) continue;
      const net = reminds.up - reminds.down;
      const disputed = net < 0;
      // strong signal or honest dispute survive; the weak middle is dropped
      if (!disputed && net < netFloor) continue;
      candidates.push({
        fid: row.fid,
        cloneName: row.name,
        cloneBrand: row.brand,
        targetFid: reminds.targetFid,
        targetName: reminds.targetName,
        targetBrand: reminds.targetBrand,
        up: reminds.up,
        down: reminds.down,
        net,
        disputed,
      });
    }
  }

  return candidates.sort((a, b) => b.net - a.net);
}
