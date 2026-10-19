// Votes repository (PRD 7.3): owner-scoped, one row per user+fragrance,
// revisionable. The domain validator stays pure, this stays thin: every bad
// client call dies loudly through the domain error, never silently coerced.
// The feed reads non-LIKE votes from here as its exclusion + penalty surface.

import { validateVote } from "@/domain/votes";
import type { FeedRejected } from "@/domain/feed";
import type { PrismaInstance } from "@/lib/prisma";

export interface SaveVoteInput {
  fragranceId: string;
  direction: string | null | undefined;
  reasonSlug?: string | null;
}

export async function saveVote(
  prisma: PrismaInstance,
  userId: string,
  input: SaveVoteInput,
): Promise<void> {
  // the validator scopes on fragranceId presence when context is given
  const vote = validateVote(
    { direction: input.direction, reasonSlug: input.reasonSlug },
    { fragranceId: input.fragranceId },
  );
  const fragrance = await prisma.fragrance.findUnique({
    where: { id: input.fragranceId },
    select: { id: true },
  });
  if (fragrance === null) {
    throw new Error(`vote: no fragrance with id "${input.fragranceId}" in the catalogue`);
  }
  await prisma.vote.upsert({
    where: { userId_fragranceId: { userId, fragranceId: input.fragranceId } },
    create: {
      userId,
      fragranceId: input.fragranceId,
      direction: vote.direction,
      reasonSlug: vote.reasonSlug,
    },
    update: { direction: vote.direction, reasonSlug: vote.reasonSlug },
  });
}

/**
 * The feed's rejected surface: every non-LIKE vote (DISLIKE/DECLINE/OWN),
 * carrying the fragrance's community accords so the feed can penalize
 * look-alikes of what the user pushed away.
 */
export async function loadRejectedForFeed(
  prisma: PrismaInstance,
  userId: string,
): Promise<FeedRejected[]> {
  const rows = await prisma.vote.findMany({
    where: { userId, direction: { not: "LIKE" } },
    include: { fragrance: { select: { accords: true } } },
  });
  return rows.map((row) => ({
    fragranceId: row.fragranceId,
    direction: row.direction as Exclude<FeedRejected["direction"], "LIKE">,
    accordNames: row.fragrance.accords,
  }));
}
