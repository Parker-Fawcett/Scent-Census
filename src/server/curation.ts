// Clone curation loader (PRD section 12/M6): the ONLY code that moves
// Fragrance.inspiredById. Candidates are proposed by the corpus's community
// reminds_me_of votes (src/curation/censusCandidates.ts), but a candidate is
// never auto-linked: it needs the curator's approved file. Every resolution
// runs on catalogueSourcePid (fragrantica-<fid>), so fragile display names
// never become identity. The loader is idempotent (ledger-shaped reruns are
// no-ops), refuses silent edge overwrites (explicit replace flag only), and
// fails loud on unresolved fids so nobody waits for an edge that never was.

import { Prisma } from "@prisma/client";
import type { PrismaInstance } from "@/lib/prisma";

export interface ApprovedEdge {
  cloneFid: string;
  targetFid: string;
  /** curator's justification; kept in the output log, not the DB */
  note?: string;
  /** move an existing inspiredById: the clone's provenance changes hands */
  replace?: boolean;
  /** a secondary "also compared to" pair. The schema stores one canonical
   * inspiration; alternates are carried for the census vote surfaces, never
   * auto-linked, which is why two famous edges were colliding at load. */
  alternate?: boolean;
}

export interface CurationSummary {
  applied: number;
  alreadyLinked: number;
  /** new inspired-edge rows recorded for census coverage (canon untouched) */
  edgesLinked: number;
  /** secondary pairs: census coverage without moving any displayed canon */
  alternates: number;
  refused: Array<{ cloneFid: string; targetFid: string; reason: string }>;
}

const corpusPid = (fid: string): string => {
  // the loader accepts a raw fid or an already-prefixed pid; both normalize
  return fid.startsWith("fragrantica-") ? fid : `fragrantica-${fid}`;
};

export async function loadApprovedCloneEdges(
  prisma: PrismaInstance,
  approved: ApprovedEdge[],
): Promise<CurationSummary> {
  const fids = [...new Set(approved.flatMap((e) => [corpusPid(e.cloneFid), corpusPid(e.targetFid)]))];
  const rows = await prisma.fragrance.findMany({
    where: { catalogueSourcePid: { in: fids } },
    select: { id: true, catalogueSourcePid: true, inspiredById: true },
  });
  const byPid = new Map(rows.map((r) => [r.catalogueSourcePid!, r]));

  const summary: CurationSummary = { applied: 0, alreadyLinked: 0, edgesLinked: 0, alternates: 0, refused: [] };
  for (const edge of approved) {
    const clonePid = corpusPid(edge.cloneFid);
    const targetPid = corpusPid(edge.targetFid);
    // identity needs no database: equality is decidable on the fids alone,
    // so it is checked before resolution
    if (clonePid === targetPid) {
      throw new Error(`curation: pair (${edge.cloneFid} -> ${edge.targetFid}) points a fragrance at itself`);
    }
    if (!byPid.has(clonePid) || !byPid.has(targetPid)) {
      const missing = !byPid.has(clonePid) ? clonePid : targetPid;
      throw new Error(
        `curation: unresolved corpus pid ${missing} for pair (${edge.cloneFid} -> ${edge.targetFid}); fix the file before loading`,
      );
    }
    const clone = byPid.get(clonePid)!;
    const target = byPid.get(targetPid)!;

    if (edge.alternate === true) {
      // alternates ship as pure census coverage: votable in the clone's
      // neighborhood, never touching the displayed canon column
      const isNew = await linkEdge(prisma, clone.id, target.id);
      if (isNew) summary.edgesLinked += 1;
      summary.alternates += 1;
      continue;
    }

    const canonWas = clone.inspiredById;
    if (canonWas === target.id) {
      summary.alreadyLinked += 1;
      const isNew = await linkEdge(prisma, clone.id, target.id);
      if (isNew) summary.edgesLinked += 1;
      continue;
    }
    if (canonWas !== null && edge.replace !== true) {
      summary.refused.push({
        cloneFid: edge.cloneFid,
        targetFid: edge.targetFid,
        reason: `clone already links to a different inspiration (${canonWas}); pass replace:true to move it`,
      });
      continue;
    }
    if (canonWas !== null && canonWas !== target.id) {
      // a deliberate canon move retires the superseded primary edge with it;
      // ambiguity between the old and the new canon is the misuse replace exists to forbid
      await prisma.inspiredByEdge.deleteMany({ where: { cloneId: clone.id, targetId: canonWas } });
    }
    await prisma.fragrance.update({
      where: { id: clone.id },
      data: { inspiredById: target.id },
    });
    const isNew = await linkEdge(prisma, clone.id, target.id);
    if (isNew) summary.edgesLinked += 1;
    summary.applied += 1;
  }
  return summary;
}

/** Census coverage row: idempotent by the pair's unique key. Recorded for
 * every approved pair, primary and alternate alike. Returns true when the
 * row is NEW (a created edge), so the summary counts honest work. */
async function linkEdge(
  prisma: PrismaInstance,
  cloneId: string,
  targetId: string,
): Promise<boolean> {
  try {
    await prisma.inspiredByEdge.create({ data: { cloneId, targetId } });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" // unique violation: the edge already exists
    ) {
      return false;
    }
    throw error;
  }
}
