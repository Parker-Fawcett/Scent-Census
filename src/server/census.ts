// Clone census repository (PRD section 7.6). The domain (census.ts) owns the
// math; this file owns persistence: one vote per user+pair with visible
// revision, every save recomputing the pair's materialized rollup inside the
// same transaction, and a ranked list that serves the two confidence levels
// plus unranked newcomers instead of hiding them.

import { Prisma } from "@prisma/client";
import { compareClones, rollupCensus, type RankLevel } from "@/domain/census";
import type { CensusBucket, CloneVotePair } from "@/domain/types";
import { floors } from "@/domain/floors";
import type { PrismaInstance } from "@/lib/prisma";

// lazy import to avoid circular coupling in test bundles
import { emitUpdateEvent } from "@/server/follows";

const CLONE_BUCKETS: CensusBucket[] = ["SPOT_ON", "CLOSE", "SIMILAR", "NOT_CLOSE"];

export interface PairRollup {
  cloneId: string;
  targetId: string;
  score: number;
  sampleSize: number;
  rankLevel: RankLevel;
  mostCommon: CensusBucket | null;
  isStale: boolean;
  computedAt: Date | null;
}

export interface RankedClone {
  cloneId: string;
  slug: string;
  cloneName: string;
  houseName: string;
  score: number;
  sampleSize: number;
  rankLevel: RankLevel;
  mostCommon: CensusBucket | null;
  // the catalogue's photo pointer so lists render bottles, not blanks
  pid: string | null;
  // where the numbers come from: our own live votes, or the corpus
  // smell-alike vote counts. The UI labels them differently.
  source: "live-census" | "smell-alike-votes";
  upVotes: number | null;
  downVotes: number | null;
  // "clone" = a copy of this fragrance; "sibling" = the same house (a
  // flanker or concentration variant like Lattafa Khamrah Qahwa); "peer" =
  // another ORIGINAL that people say smells alike (Bvlgari Tygar and
  // Sospiro Vibrato are both originals, neither is a copy of the other)
  kind: "clone" | "sibling" | "peer";
  // community price-perception vote (1 = way overpriced, 5 = great value).
  // The gap between the copy and the original is the buying signal.
  valueScore: number | null;
  // the original's own value vote, so a row can show the gap
  originalValueScore: number | null;
  // retail price captures, sized. The copy's price against the original's
  // price is the number a buyer actually acts on.
  priceCaptures: Array<{ priceCents: number; sizeMl: number | null; capturedAt: Date }>;
  originalPriceCaptures: Array<{ priceCents: number; sizeMl: number | null; capturedAt: Date }>;
  // the house behind this clone, so an ad slot sponsored by a house in this
  // family can be suppressed on this page
  houseId: string | null;
}

function rankLevelFor(sampleSize: number): RankLevel {
  if (sampleSize >= floors.census.confidentVotes) return "confident";
  if (sampleSize >= floors.census.lowConfidenceVotes) return "low";
  return "none";
}

/** Aggregate one pair's votes into its materialized CloneRollup. Caller may
 * pass a transaction client (save path) or the plain client (cron backstop). */
export async function recomputePairRollup(
  prisma: Prisma.TransactionClient,
  cloneId: string,
  targetId: string,
): Promise<PairRollup> {
  const votes = await prisma.cloneVote.findMany({ where: { cloneId, targetId } });
  const pairs: CloneVotePair[] = votes.map((v) => ({
    userId: v.userId,
    cloneId: v.cloneId,
    targetId: v.targetId,
    bucket: v.bucket,
  }));
  const rollup = rollupCensus(pairs);

  const counts = new Map<CensusBucket, number>();
  for (const v of pairs) counts.set(v.bucket, (counts.get(v.bucket) ?? 0) + 1);
  const mostCommon =
    rollup.sampleSize === 0 ? null : [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  await prisma.cloneRollup.upsert({
    where: { cloneId_targetId: { cloneId, targetId } },
    create: {
      cloneId,
      targetId,
      score: rollup.score,
      sampleSize: rollup.sampleSize,
      computedAt: new Date(),
      isStale: false,
    },
    update: {
      score: rollup.score,
      sampleSize: rollup.sampleSize,
      computedAt: new Date(),
      isStale: false,
    },
  });

  return {
    cloneId,
    targetId,
    score: rollup.score,
    sampleSize: rollup.sampleSize,
    rankLevel: rankLevelFor(rollup.sampleSize),
    mostCommon,
    isStale: false,
    computedAt: new Date(),
  };
}

export async function saveCloneVote(
  prisma: PrismaInstance,
  userId: string,
  input: { cloneId: string; targetId: string; bucket: string },
): Promise<PairRollup> {
  const { cloneId, targetId, bucket } = input;
  if (!CLONE_BUCKETS.includes(bucket as CensusBucket)) {
    throw new Error(`census: unknown closeness bucket "${bucket}"`);
  }
  if (cloneId === targetId) {
    throw new Error("census: a fragrance cannot be voted close to itself");
  }
  // existence checks before the vote land: a tampered id must die as a
  // readable census error, not a foreign-key violation mid-transaction
  const anchors = await prisma.fragrance.findMany({
    where: { id: { in: [cloneId, targetId] } },
    select: { id: true },
  });
  const present = new Set(anchors.map((f) => f.id));
  if (!present.has(cloneId) || !present.has(targetId)) {
    throw new Error("census: unknown fragrance on the clone or target side");
  }

  // the previous rollup, so the milestone detector can tell a transition
  // (none -> low, low -> confident) from a same-level vote
  const previous = await loadPairRollup(prisma, cloneId, targetId);

  const next = await prisma.$transaction(async (tx) => {
    await tx.cloneVote.upsert({
      where: { userId_cloneId_targetId: { userId, cloneId, targetId } },
      create: { userId, cloneId, targetId, bucket: bucket as CensusBucket },
      update: { bucket: bucket as CensusBucket, votedAt: new Date() },
    });
    return recomputePairRollup(tx, cloneId, targetId);
  });

  // emit a milestone only on a rank-level transition; a same-level vote
  // would otherwise spam the update strip every vote
  if (previous === null || previous.rankLevel !== next.rankLevel) {
    if (next.rankLevel === "low" || next.rankLevel === "confident") {
      try {
        // emission runs after the transaction commits so a follower-side
        // failure cannot roll back the vote itself
        await emitUpdateEvent(prisma, {
          subjectType: "FRAGRANCE",
          subjectId: targetId,
          type: "CENSUS_MILESTONE",
          payload: {
            cloneId,
            targetId,
            rankLevel: next.rankLevel,
            sampleSize: next.sampleSize,
            score: next.score,
            mostCommon: next.mostCommon,
            dedupKey: `${cloneId}:${targetId}:milestone:${next.rankLevel}`,
          },
          sourceLabel: "the community",
          occurredAt: new Date(),
          dedupKey: `${cloneId}:${targetId}:milestone:${next.rankLevel}`,
        });
        // followers of the clone hear about it too
        await emitUpdateEvent(prisma, {
          subjectType: "FRAGRANCE",
          subjectId: cloneId,
          type: "CENSUS_MILESTONE",
          payload: {
            cloneId,
            targetId,
            rankLevel: next.rankLevel,
            sampleSize: next.sampleSize,
            score: next.score,
            mostCommon: next.mostCommon,
            dedupKey: `${cloneId}:${targetId}:milestone:${next.rankLevel}`,
          },
          sourceLabel: "the community",
          occurredAt: new Date(),
          dedupKey: `${cloneId}:${targetId}:milestone:${next.rankLevel}`,
        });
      } catch (error) {
        console.error("census milestone emission failed:", error instanceof Error ? error.message : error);
      }
    }
  }
  return next;
}

export async function clearCloneVoteForUser(
  prisma: PrismaInstance,
  userId: string,
  cloneId: string,
  targetId: string,
): Promise<PairRollup | null> {
  // milestones fire on PROMOTION only (saveCloneVote); a clear that demotes a
  // pair is deliberately silent so the update strip never announces "lost
  // confidence" noise. Revisit if the product wants demotion notices.
  return prisma.$transaction(async (tx) => {
    await tx.cloneVote.deleteMany({ where: { userId, cloneId, targetId } });
    return recomputePairRollup(tx, cloneId, targetId);
  });
}

/** Explicit unranked state when nothing was ever voted (PRD 7.6). */
export const EMPTY_ROLLUP: Omit<PairRollup, "cloneId" | "targetId"> = {
  score: 0,
  sampleSize: 0,
  rankLevel: "none",
  mostCommon: null,
  isStale: false,
  computedAt: null,
};

export async function loadPairRollup(
  prisma: PrismaInstance,
  cloneId: string,
  targetId: string,
): Promise<PairRollup | null> {
  const row = await prisma.cloneRollup.findUnique({
    where: { cloneId_targetId: { cloneId, targetId } },
  });
  if (row === null) return null;
  // mostCommon is derived, not stored, so a fetch shows what the votes say
  const votes = await prisma.cloneVote.findMany({
    where: { cloneId, targetId },
    select: { bucket: true },
  });
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.bucket, (counts.get(v.bucket) ?? 0) + 1);
  const mostCommon =
    votes.length === 0
      ? null
      : ([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] as CensusBucket);
  return {
    cloneId,
    targetId,
    score: row.score,
    sampleSize: row.sampleSize,
    rankLevel: rankLevelFor(row.sampleSize),
    mostCommon,
    isStale: row.isStale,
    computedAt: row.computedAt,
  };
}

/** The census ranking for one target fragrance: curated clone edges plus
 * everything the community voted, ordered by domain rules (confident over
 * low over unranked; inside a level, scores beat band-mates; ties go
 * alphabetically; unranked clones stay visible at the tail). */
export async function loadRankedClones(
  prisma: PrismaInstance,
  targetId: string,
): Promise<RankedClone[]> {
  // Two sources of truth, in priority order:
  //  1. CloneRollup: our own measured census (live user votes). Authoritative
  //     when it has rows, because those are votes cast on this site.
  //  2. InspiredByEdge: the corpus smell-alike graph, which carries REAL
  //     community vote counts ("this clone reminds me of the original" /
  //     "it does not") from the source snapshot. These are measured too, just
  //     measured elsewhere, so they are labeled as such in the UI.
  const rows = await prisma.cloneRollup.findMany({
    where: { targetId },
    include: { clone: { select: { id: true, name: true, slug: true, house: { select: { name: true, id: true } }, catalogueSourcePid: true } } },
  });

  // votes across the whole target arrive in one query; bucket mode per clone
  // derives from them, so the list shows measured buckets, not editorial picks
  const votes = await prisma.cloneVote.findMany({
    where: { targetId },
    select: { cloneId: true, bucket: true },
  });
  const votesByClone = new Map<string, Map<string, number>>();
  for (const v of votes) {
    const counts = votesByClone.get(v.cloneId) ?? new Map<string, number>();
    counts.set(v.bucket, (counts.get(v.bucket) ?? 0) + 1);
    votesByClone.set(v.cloneId, counts);
  };
  const mostCommonOf = (cloneId: string, sampleSize: number): CensusBucket | null => {
    if (sampleSize === 0) return null;
    const counts = votesByClone.get(cloneId);
    if (!counts) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] as CensusBucket | null;
  };

  // the smell-alike graph: every curated pair, with its measured vote counts
  const edges = await prisma.inspiredByEdge.findMany({
    where: { targetId },
    include: { clone: { select: { id: true, name: true, slug: true, house: { select: { name: true, id: true } }, catalogueSourcePid: true } } },
  });
  const edges0 = edges;

  // the retail prices for every clone and original in play. Only captures
  // near 100ml count, because that is the size clone houses standardize on
  // and the size a buyer compares.
  const priceRows = await prisma.pricePoint.findMany({
    where: {
      fragranceId: { in: [targetId, ...rows.map((r) => r.cloneId), ...edges0.map((e) => e.cloneId)] },
      capturedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { fragranceId: true, priceCents: true, sizeMl: true, capturedAt: true },
  });
  const pricesById = new Map<string, Array<{ priceCents: number; sizeMl: number | null; capturedAt: Date }>>();
  for (const p of priceRows) {
    const list = pricesById.get(p.fragranceId) ?? [];
    list.push({ priceCents: p.priceCents, sizeMl: p.sizeMl, capturedAt: p.capturedAt });
    pricesById.set(p.fragranceId, list);
  }
  const targetPrice = pricesById.get(targetId) ?? [];

  // the price-perception votes for every clone and original in play
  const valueRows = await prisma.fragrance.findMany({
    where: { id: { in: [targetId, ...rows.map((r) => r.cloneId), ...edges0.map((e) => e.cloneId)] } },
    select: { id: true, priceValue: true },
  });
  const valueById = new Map(valueRows.map((v) => [v.id, v.priceValue]));
  const targetValue = valueById.get(targetId) ?? null;

  const entries: RankedClone[] = rows.map((row) => ({
    cloneId: row.cloneId,
    slug: row.clone.slug,
    cloneName: row.clone.name,
    houseName: row.clone.house.name,
    score: row.score,
    sampleSize: row.sampleSize,
    rankLevel: rankLevelFor(row.sampleSize),
    mostCommon: mostCommonOf(row.cloneId, row.sampleSize),
    pid: row.clone.catalogueSourcePid,
    source: "live-census" as const,
    upVotes: null,
    downVotes: null,
    kind: "clone" as const,
    valueScore: valueById.get(row.cloneId) ?? null,
    originalValueScore: targetValue,
    priceCaptures: pricesById.get(row.cloneId) ?? [],
    originalPriceCaptures: targetPrice,
    houseId: row.clone.house.id,
  }));

  const seenClones = new Set(entries.map((e) => e.cloneId));
  for (const edge of edges) {
    if (seenClones.has(edge.cloneId)) continue;
    const total = edge.upVotes + edge.downVotes;
    // closeness = share of voters who said it reminds them of the original
    const score = total > 0 ? Math.round((edge.upVotes / total) * 100) : 0;
    entries.push({
      cloneId: edge.clone.id,
      slug: edge.clone.slug,
      cloneName: edge.clone.name,
      houseName: edge.clone.house.name,
      score,
      sampleSize: total,
      rankLevel: rankLevelFor(total),
      mostCommon: null,
      pid: edge.clone.catalogueSourcePid,
      source: "smell-alike-votes",
      upVotes: edge.upVotes,
      downVotes: edge.downVotes,
      valueScore: valueById.get(edge.clone.id) ?? null,
      originalValueScore: targetValue,
      priceCaptures: pricesById.get(edge.clone.id) ?? [],
      originalPriceCaptures: targetPrice,
      houseId: edge.clone.house.id,
      // same-house pairs are flankers and concentration siblings, not clones.
      // both-designer-priced pairs are two originals that smell alike, which
      // is a peer relation, not a copy.
      kind:
        edge.source === "corpus-smell-alike-sibling"
          ? "sibling"
          : edge.source === "corpus-smell-alike-peer"
            ? "peer"
            : "clone",
    });
    seenClones.add(edge.clone.id);
  }

  // curated edges without any vote yet join the list as explicitly unranked
  // (sampleSize 0) rather than vanishing: the census shows its own blanks
  const curated = await prisma.fragrance.findMany({
    where: {
      OR: [
        { inspiredById: targetId },
        { inspiredEdgesAsClone: { some: { targetId } } },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      catalogueSourcePid: true,
      house: { select: { name: true, id: true } },
    },
  });
  for (const frag of curated) {
    if (seenClones.has(frag.id)) continue;
    entries.push({
      cloneId: frag.id,
      slug: frag.slug,
      cloneName: frag.name,
      houseName: frag.house.name,
      score: EMPTY_ROLLUP.score,
      sampleSize: 0,
      rankLevel: "none",
      mostCommon: null,
      pid: frag.catalogueSourcePid,
      source: "live-census",
      upVotes: null,
      downVotes: null,
      kind: "clone" as const,
      valueScore: valueById.get(frag.id) ?? null,
      originalValueScore: targetValue,
      priceCaptures: pricesById.get(frag.id) ?? [],
      originalPriceCaptures: targetPrice,
      houseId: frag.house.id,
    });
  }

  // the raw compare call only decides order strictly; inside the tie band the
  // PRD demands alphabetical, so name decides when the domain says "tied"
  const LEVEL_RANK: Record<RankLevel, number> = { confident: 0, low: 1, none: 2 };
  entries.sort((a, b) => {
    if (LEVEL_RANK[a.rankLevel] !== LEVEL_RANK[b.rankLevel]) {
      return LEVEL_RANK[a.rankLevel] - LEVEL_RANK[b.rankLevel];
    }
    const verdict = compareClones(
      { sampleSize: a.sampleSize, score: a.score, rankLevel: a.rankLevel, mostCommon: a.mostCommon },
      { sampleSize: b.sampleSize, score: b.score, rankLevel: b.rankLevel, mostCommon: b.mostCommon },
    );
    if (verdict === "tied") return a.cloneName.localeCompare(b.cloneName);
    return verdict === "a" ? -1 : 1;
  });
  return entries;
}
