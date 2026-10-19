// Clone curation loader (PRD section 12/M6): the ONLY code that moves
// Fragrance.inspiredById. Candidates are proposed by the corpus's community
// reminds_me_of votes (src/curation/censusCandidates.ts), but a candidate is
// never auto-linked: it needs the curator's approved file. Every resolution
// runs on catalogueSourcePid (fragrantica-<fid>), so fragile display names
// never become identity. The loader is idempotent (ledger-shaped reruns are
// no-ops), refuses silent edge overwrites (explicit replace flag only), and
// fails loud on unresolved fids so nobody waits for an edge that never was.

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
  /** alternate pairs: recorded for the census product, deliberately unlinked */
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

  const summary: CurationSummary = { applied: 0, alreadyLinked: 0, alternates: 0, refused: [] };
  for (const edge of approved) {
    const clonePid = corpusPid(edge.cloneFid);
    const targetPid = corpusPid(edge.targetFid);
    // identity needs no database: equality is decidable on the fids alone,
    // so it is checked before resolution
    if (clonePid === targetPid) {
      throw new Error(`curation: pair (${edge.cloneFid} -> ${edge.targetFid}) points a fragrance at itself`);
    }
    if (edge.alternate === true) {
      // recorded in the file, never in the DB column; still resolved so a
      // mistyped fid cannot hide inside an alternate entry
      if (!byPid.has(clonePid) || !byPid.has(targetPid)) {
        throw new Error(
          `curation: unresolved alternate pair (${edge.cloneFid} -> ${edge.targetFid})`,
        );
      }
      summary.alternates += 1;
      continue;
    }
    const clone = byPid.get(clonePid);
    const target = byPid.get(targetPid);
    if (!clone || !target) {
      const missing = !clone ? clonePid : targetPid;
      throw new Error(
        `curation: unresolved corpus pid ${missing} for pair (${edge.cloneFid} -> ${edge.targetFid}); fix the file before loading`,
      );
    }
    if (clone.inspiredById === target.id) {
      summary.alreadyLinked += 1;
      continue;
    }
    if (clone.inspiredById !== null && edge.replace !== true) {
      summary.refused.push({
        cloneFid: edge.cloneFid,
        targetFid: edge.targetFid,
        reason: `clone already links to a different inspiration (${clone.inspiredById}); pass replace:true to move it`,
      });
      continue;
    }
    await prisma.fragrance.update({
      where: { id: clone.id },
      data: { inspiredById: target.id },
    });
    summary.applied += 1;
  }
  return summary;
}
