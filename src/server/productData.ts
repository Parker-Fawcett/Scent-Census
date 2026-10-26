import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadMarketSource } from "@/server/marketData";
import { listCreatorPickupsForFragrance } from "@/server/creators";
import { loadPairRollup, loadRankedClones } from "@/server/census";
import { loadCloneClaims } from "@/server/cloneClaims";
import { estimateFromSource } from "@/domain/marketSources";
import type { CensusBucket } from "@/domain/types";

export async function loadProduct(slug: string) {
  await connection();
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  const fragrance = await prisma.fragrance.findUnique({
    where: { slug },
    include: {
      house: true,
      inspiredBy: { include: { house: true } },
      notes: { include: { note: true }, orderBy: { weight: "desc" } },
    },
  });
  if (fragrance === null) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  const f = fragrance!;

  const rankedClones = await loadRankedClones(prisma, f.id);
  const myTargetVotes = viewerId
    ? await prisma.cloneVote.findMany({
        where: { userId: viewerId, targetId: f.id },
        select: { cloneId: true, bucket: true },
      })
    : [];
  const myVoteByClone = new Map(myTargetVotes.map((v) => [v.cloneId, v.bucket as CensusBucket]));

  const canonRollup =
    f.inspiredById !== null ? await loadPairRollup(prisma, f.id, f.inspiredById) : null;
  const myCanonVote = (
    viewerId && f.inspiredById !== null
      ? await prisma.cloneVote.findUnique({
          where: { userId_cloneId_targetId: { userId: viewerId, cloneId: f.id, targetId: f.inspiredById } },
        })
      : null
  )?.bucket as CensusBucket | undefined;

  const canonCountRows =
    f.inspiredById !== null
      ? await prisma.cloneVote.groupBy({
          by: ["bucket"],
          where: { cloneId: f.id, targetId: f.inspiredById },
          _count: { bucket: true },
        })
      : [];
  const canonCounts = Object.fromEntries(
    canonCountRows.map((g) => [g.bucket, g._count.bucket]),
  ) as Partial<Record<CensusBucket, number>>;

  const isFollowing = viewerId
    ? (await prisma.follow.findUnique({
        where: { userId_subjectType_subjectId: { userId: viewerId, subjectType: "FRAGRANCE", subjectId: f.id } },
      })) !== null
    : false;

  const siblingDupes =
    f.inspiredById !== null ? await loadRankedClones(prisma, f.inspiredById) : [];

  const canonSeed =
    f.inspiredById !== null
      ? await prisma.communitySeed.findUnique({
          where: { cloneId_targetId: { cloneId: f.id, targetId: f.inspiredById } },
        })
      : null;
  const targetSeeds = await prisma.communitySeed.findMany({ where: { targetId: f.id } });
  const seedByClone = new Map(targetSeeds.map((s: any) => [s.cloneId, s]));

  const source = await loadMarketSource(prisma, [f.id]);
  const groups = estimateFromSource(source, f.id, { now: new Date() }).filter(
    (g) => g.estimate.status !== "none",
  );

  const videoReviews = await listCreatorPickupsForFragrance(prisma, f.id);

  // Public claims are a separate record from the census on purpose. They
  // describe what sellers and communities say, not what our voters measured.
  const cloneClaims = await loadCloneClaims(prisma, f.id);

  return {
    slug,
    viewerId,
    fragrance: f,
    rankedClones,
    myVoteByClone,
    canonRollup,
    myCanonVote,
    canonCounts,
    isFollowing,
    siblingDupes,
    groups,
    videoReviews,
    canonSeed,
    seedByClone,
    cloneClaims,
  };
}