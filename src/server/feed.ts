// Feed repository (PRD 7.4 + 7.3 server side): assemble REAL user inputs
// (profile, shelf, pushed-away votes, last-shown state) into the domain's
// feed, plus a bounded candidate universe from the catalogue. The corpus is
// 140k rows, so candidate selection narrows in SQL by candidate nature: the
// taste pool overlaps the user's known accords or links into their shelf, the
// contrast pool provably touches nothing the user likes or pushed away. The
// domain then does the actual scoring, pool classification and composition
// unchanged.

import {
  buildFeed,
  makeJitterSeed,
  type FeedCard,
  type FeedCandidate,
  type FeedInputs,
} from "@/domain/feed";
import type { BudgetBand, CloneBand } from "@/domain/onboarding";
import { loadRejectedForFeed } from "@/server/votes";
import type { PrismaInstance } from "@/lib/prisma";

export interface FeedPage {
  cards: FeedCard[];
}

export interface BuildFeedPageOptions {
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 6;
const TASTE_POOL_SIZE = 300;
const CONTRAST_POOL_SIZE = 300;

// The render records what it showed (FeedPageState), so two concurrent builds
// for the same user could interleave reads/writes and let a fragrance appear
// back-to-back with the same reason. Serialize per user. Single-instance
// lock; multi-instance deploys need a DB advisory lock before M7.
const buildLocks = new Map<string, Promise<FeedPage>>();

export async function buildFeedPage(
  prisma: PrismaInstance,
  userId: string,
  options?: BuildFeedPageOptions,
): Promise<FeedPage> {
  const previous = buildLocks.get(userId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() =>
    // the in-process lock keeps a single instance honest; the advisory lock
    // below keeps multi-instance deploys honest. pg_advisory_xact_lock is
    // released at transaction commit, so a crashed build cannot strand it.
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      return buildFeedPageInner(tx as unknown as PrismaInstance, userId, options);
    }),
  );
  buildLocks.set(userId, run);
  run.finally(() => {
    if (buildLocks.get(userId) === run) buildLocks.delete(userId);
  }).catch(() => undefined);
  return run;
}

async function buildFeedPageInner(
  prisma: PrismaInstance,
  userId: string,
  options?: BuildFeedPageOptions,
): Promise<FeedPage> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { budgetBand: true, cloneBand: true, accordPrefs: true },
  });
  if (user === null) {
    throw new Error(`feed: no user "${userId}"`);
  }

  const [shelfRows, rejected] = await Promise.all([
    prisma.collectionItem.findMany({
      where: { userId },
      include: { fragrance: { select: { accords: true, houseId: true, name: true, inspiredById: true } } },
    }),
    loadRejectedForFeed(prisma, userId),
  ]);

  const shelfAccords = [...new Set(shelfRows.flatMap((s) => s.fragrance.accords))];
  const shelfIds = shelfRows.map((s) => s.fragranceId);

  // every vote is "seen" (LIKE included): candidates exclude all of them;
  // the rejected (non-LIKE) slice additionally feeds the look-alike penalty
  const allVotedIds = (
    await prisma.vote.findMany({ where: { userId }, select: { fragranceId: true } })
  ).map((v) => v.fragranceId);

  // shelf members + last page shown are never candidates (they were shown
  // before or live on the shelf now)
  const state = await prisma.feedPageState.findUnique({ where: { userId } });
  const shownRecently = parseShown(state?.shownRecently);
  const shownIds = [...shownRecently.keys()];

  const knownAccords = [...new Set([...user.accordPrefs, ...shelfAccords])].filter((a) => a !== "");
  const rejectedAccords = [...new Set(rejected.flatMap((r) => r.accordNames))];

  // candidate nature respects the domain's own taste/contrast definition, so
  // the SQL narrowing must not hand the domain a tastified-only universe:
  // taste pool = accord overlap or inspiration into the shelf; contrast pool
  // = provably zero overlap with known and rejected accords and no link.
  const excluded = [...shelfIds, ...allVotedIds, ...shownIds];
  // sample offsets must stay inside the real pool size or Prisma skips past
  // the end of a small catalogue and the page goes empty
  const [tasteCount] = knownAccords.length > 0
    ? await Promise.all([
        prisma.fragrance.count({
          where: { OR: [{ accords: { hasSome: knownAccords } }, { inspiredById: { in: shelfIds } }] },
        }),
      ])
    : [0];
  const contrastWhere = {
    NOT: { accords: { hasSome: [...knownAccords, ...rejectedAccords] } },
    inspiredById: null,
    id: { notIn: excluded },
  };
  const [contrastCount] = knownAccords.length > 0
    ? await Promise.all([prisma.fragrance.count({ where: contrastWhere })])
    : [0];
  const [tasteRows, contrastRows] = await Promise.all([
    knownAccords.length > 0
      ? prisma.fragrance.findMany({
          where: { OR: [{ accords: { hasSome: knownAccords } }, { inspiredById: { in: shelfIds } }] },
          include: candidateInclude,
          take: TASTE_POOL_SIZE,
          // deterministic per-user sample position, same reasoning as the
          // contrast pool: without it every sweet-pref user saw the same 300
          // first-sorted rows
          skip: sampleSkip(userId, knownAccords, tasteCount, TASTE_POOL_SIZE),
          orderBy: { id: "asc" },
        })
      : [],
    knownAccords.length > 0
      ? prisma.fragrance.findMany({
          where: contrastWhere,
          include: candidateInclude,
          take: CONTRAST_POOL_SIZE,
          skip: sampleSkip(userId, knownAccords, contrastCount, CONTRAST_POOL_SIZE),
          orderBy: { id: "asc" },
        })
      : sampledWithoutAccords(prisma, excluded, userId, rejectedAccords),
  ]);

  const candidates = [
    ...tasteRows,
    ...contrastRows,
  ].filter((row) => !excluded.includes(row.id));

  const inspiredBy = new Map<string, string | null>(
    candidates.map((row) => [row.id, row.inspiredById] as const),
  );
  for (const shelfRow of shelfRows) {
    inspiredBy.set(shelfRow.fragranceId, shelfRow.fragrance.inspiredById);
  }

  const inputs: FeedInputs = {
    profile: {
      budgetBand: (user.budgetBand as BudgetBand | null) ?? null,
      cloneBand: (user.cloneBand as CloneBand | null) ?? null,
      accordPrefs: user.accordPrefs,
    },
    shelf: shelfRows.map((row) => ({
      fragranceId: row.fragranceId,
      name: row.fragrance.name,
      accordNames: row.fragrance.accords,
      houseId: undefined,
    })),
    rejected,
    inspiredBy,
    shownRecently,
    seed: makeJitterSeed(userId),
    pageSize,
  };

  const { cards } = buildFeed(
    candidates.map(toCandidate),
    inputs,
  );

  // replace (not merge): the PRD 7.3 rule is about the IMMEDIATELY earlier
  // page, so the state records exactly what the current page showed
  await prisma.feedPageState.upsert({
    where: { userId },
    create: { userId, shownRecently: shownMapJson(cards) },
    update: { shownRecently: shownMapJson(cards) },
  });

  return { cards };
}

const candidateInclude = {
  house: { select: { id: true, name: true, slug: true, tier: true } },
  notes: { include: { note: { select: { name: true } } }, orderBy: { weight: "desc" as const } },
  estimate: true,
} as const;

type CandidateRow = {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  inspiredById: string | null;
  accords: string[];
  house: { id: string; name: string; slug: string; tier: string };
  notes: Array<{ weight: number; note: { name: string } }>;
  estimate: { lowCents: number; highCents: number } | null;
};

function toCandidate(row: CandidateRow): FeedCandidate {
  return {
    fragranceId: row.id,
    fragranceSlug: row.slug,
    name: row.name,
    house: {
      id: row.house.id,
      name: row.house.name,
      slug: row.house.slug,
      tier: row.house.tier as FeedCandidate["house"]["tier"],
    },
    accordNames: row.accords,
    noteNames: row.notes.slice(0, 6).map((n) => n.note.name),
    inspiredById: row.inspiredById,
    estimateCentsLow: row.estimate?.lowCents ?? null,
    estimateCentsHigh: row.estimate?.highCents ?? null,
    year: row.year,
  };
}

function shownMapJson(cards: FeedCard[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const card of cards) {
    out[card.candidate.fragranceId] = card.reasonSlug;
  }
  return out;
}

function parseShown(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (raw === null || typeof raw !== "object") return map;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") map.set(key, value);
  }
  return map;
}

function sampleSkip(userId: string, accords: string[], poolCount: number, take: number): number {
  // FNV-1a reused from the domain seed idea: a stable fraction of the pool,
  // clamped so a small catalogue never skips past its whole pool
  if (poolCount <= take) return 0;
  const hash = makeJitterSeed(`${userId}|${[...accords].sort().join(",")}+${userId}`);
  return hash % Math.max(poolCount - take, 1);
}

async function sampledWithoutAccords(
  prisma: PrismaInstance,
  excluded: string[],
  userId: string,
  rejectedAccords: string[],
): Promise<CandidateRow[]> {
  const where = {
    id: { notIn: excluded },
    inspiredById: null,
    ...(rejectedAccords.length > 0
      ? { NOT: { accords: { hasSome: rejectedAccords } } }
      : {}),
  };
  const total = await prisma.fragrance.count({ where });
  if (total === 0) return [];
  const skip = makeJitterSeed(`contrast-empty-${userId}`) % Math.max(total - CONTRAST_POOL_SIZE, 1);  return prisma.fragrance.findMany({
    where,
    include: candidateInclude,
    take: CONTRAST_POOL_SIZE,
    skip,
    orderBy: { id: "asc" },
  });
}
