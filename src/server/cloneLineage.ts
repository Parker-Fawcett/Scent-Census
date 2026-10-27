// The clone lineage around one bottle.
//
// The catalogue's `inspiredById` field is a single canonical pointer and it
// is often empty for corpus clones: Marwa has no inspiredById, Inception has
// none either, yet Inception points at Marwa and Marwa points at Imagination.
// The product page used to read only inspiredById, so clicking a clone lost
// the original entirely. These helpers read the measured edges instead, so a
// clone page always knows what it copies and an original page can show the
// second-in-line clones that sit behind its direct copies.

import type { PrismaInstance } from "@/lib/prisma";

export type CloneTargetKind = "clone" | "sibling" | "peer";

export interface CloneTarget {
  id: string;
  slug: string;
  name: string;
  houseName: string;
  year: number | null;
  pid: string | null;
  /** share of voters who said it reminds them of this target */
  score: number;
  sampleSize: number;
  upVotes: number;
  downVotes: number;
  kind: CloneTargetKind;
  /** the target's own price-perception vote, used for the value gap */
  valueScore: number | null;
}

function kindOf(source: string): CloneTargetKind {
  if (source === "corpus-smell-alike-sibling") return "sibling";
  if (source === "corpus-smell-alike-peer") return "peer";
  return "clone";
}

function scoreOf(up: number, down: number): number {
  const total = up + down;
  return total > 0 ? Math.round((up / total) * 100) : 0;
}

/**
 * Every original this bottle has been measured against, strongest sample
 * first. A same-house edge is a sibling (a flanker or concentration), never
 * a clone, and it is tagged so the page can keep the words honest.
 */
export async function loadCloneTargets(
  prisma: PrismaInstance,
  cloneId: string,
): Promise<CloneTarget[]> {
  const edges = await prisma.inspiredByEdge.findMany({
    where: { cloneId },
    include: {
      target: {
        select: {
          id: true,
          slug: true,
          name: true,
          year: true,
          catalogueSourcePid: true,
          priceValue: true,
          house: { select: { name: true } },
        },
      },
    },
  });

  return edges
    .map((edge) => ({
      id: edge.target.id,
      slug: edge.target.slug,
      name: edge.target.name,
      houseName: edge.target.house.name,
      year: edge.target.year,
      pid: edge.target.catalogueSourcePid,
      score: scoreOf(edge.upVotes, edge.downVotes),
      sampleSize: edge.upVotes + edge.downVotes,
      upVotes: edge.upVotes,
      downVotes: edge.downVotes,
      kind: kindOf(edge.source),
      valueScore: edge.target.priceValue,
    }))
    .sort(
      (a, b) =>
        b.sampleSize - a.sampleSize ||
        b.score - a.score ||
        a.name.localeCompare(b.name),
    );
}

export interface SecondDegreeClone {
  id: string;
  slug: string;
  name: string;
  houseName: string;
  year: number | null;
  pid: string | null;
  score: number;
  sampleSize: number;
  /** the direct clone it was measured against */
  parentId: string;
  parentSlug: string;
  parentName: string;
  /** that parent's closeness to the page's original */
  parentScore: number;
}

/**
 * Clones of the direct clones. On Imagination's page this is where Inception
 * belongs: it copies Marwa, and Marwa is listed in Imagination's family.
 * Inception sits here for lineage alone, with its own closeness score
 * waiting on votes cast on this site.
 */
export async function loadSecondDegreeClones(
  prisma: PrismaInstance,
  direct: Array<{ id: string; slug: string; name: string; score: number }>,
  excludeIds: string[],
  limit = 6,
): Promise<SecondDegreeClone[]> {
  if (direct.length === 0) return [];
  const parentById = new Map(direct.map((parent) => [parent.id, parent]));
  const directIds = direct.map((parent) => parent.id);

  const edges = await prisma.inspiredByEdge.findMany({
    where: {
      targetId: { in: directIds },
      cloneId: { notIn: [...directIds, ...excludeIds] },
      source: { notIn: ["corpus-smell-alike-sibling", "corpus-smell-alike-peer"] },
    },
    include: {
      clone: {
        select: {
          id: true,
          slug: true,
          name: true,
          year: true,
          catalogueSourcePid: true,
          house: { select: { name: true } },
        },
      },
    },
    orderBy: [{ upVotes: "desc" }],
    take: Math.max(40, limit * 8),
  });

  const byClone = new Map<string, SecondDegreeClone>();
  for (const edge of edges) {
    const parent = parentById.get(edge.targetId);
    if (parent === undefined) continue;
    const total = edge.upVotes + edge.downVotes;
    if (total < 25) continue;
    const candidate: SecondDegreeClone = {
      id: edge.clone.id,
      slug: edge.clone.slug,
      name: edge.clone.name,
      houseName: edge.clone.house.name,
      year: edge.clone.year,
      pid: edge.clone.catalogueSourcePid,
      score: scoreOf(edge.upVotes, edge.downVotes),
      sampleSize: total,
      parentId: parent.id,
      parentSlug: parent.slug,
      parentName: parent.name,
      parentScore: parent.score,
    };
    const existing = byClone.get(candidate.id);
    if (
      existing === undefined ||
      candidate.sampleSize > existing.sampleSize ||
      (candidate.sampleSize === existing.sampleSize && candidate.score > existing.score)
    ) {
      byClone.set(candidate.id, candidate);
    }
  }

  return [...byClone.values()]
    .sort((a, b) => b.sampleSize - a.sampleSize || b.score - a.score)
    .slice(0, limit);
}
