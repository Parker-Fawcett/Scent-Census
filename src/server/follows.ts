// Follows + update feed (PRD section 7.7). The Follow table scopes every
// read by user; emission is fan-out at write time, one row per follower, so
// the home strip is a cheap user-keyed read. Dedup is by an explicit key
// (the event's natural identity, e.g. "pair:milestone:25") rather than a
// timestamp, so a re-fired rollup cannot spam a feed that has already seen it.

import { Prisma } from "@prisma/client";
import type { PrismaInstance } from "@/lib/prisma";
import type { UpdateEventType, SubjectType } from "@prisma/client";

export interface ToggleFollowResult {
  following: boolean;
}

export interface FollowInput {
  subjectType: SubjectType;
  subjectId: string;
}

export interface EmitUpdateInput {
  subjectType: SubjectType;
  subjectId: string;
  type: UpdateEventType;
  payload: unknown;
  sourceLabel: string;
  occurredAt: Date;
  /** stable identity for this event; emission with a seen key is a no-op */
  dedupKey?: string;
}

export async function toggleFollow(
  prisma: PrismaInstance,
  userId: string,
  input: FollowInput,
): Promise<ToggleFollowResult> {
  const key = { userId, subjectType: input.subjectType, subjectId: input.subjectId };
  const existing = await prisma.follow.findUnique({ where: { userId_subjectType_subjectId: key } });
  if (existing !== null) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return { following: false };
  }
  try {
    await prisma.follow.create({ data: key });
  } catch (error) {
    // two concurrent toggles can both pass the findUnique; the unique
    // constraint is the real arbiter, so a collision means "already there"
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const now = await prisma.follow.findUnique({ where: { userId_subjectType_subjectId: key } });
      if (now !== null) {
        await prisma.follow.delete({ where: { id: now.id } });
        return { following: false };
      }
    }
    throw error;
  }
  return { following: true };
}

export async function emitUpdateEvent(
  prisma: PrismaInstance,
  input: EmitUpdateInput,
): Promise<{ emitted: number }> {
  // followers of this subject; one event each
  const followers = await prisma.follow.findMany({
    where: { subjectType: input.subjectType, subjectId: input.subjectId },
    select: { userId: true },
  });
  if (followers.length === 0) return { emitted: 0 };

  // dedup: if the caller supplied a key, one row with that payload identity
  // already existing means the milestone was already announced
  if (input.dedupKey !== undefined) {
    const already = await prisma.updateEvent.findFirst({
      where: {
        type: input.type,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        dedupKey: input.dedupKey,
      },
      select: { id: true },
    });
    if (already !== null) return { emitted: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const follower of followers) {
      try {
        await tx.updateEvent.create({
          data: {
            userId: follower.userId,
            type: input.type,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            payload: input.payload ?? {},
            occurredAt: input.occurredAt,
            sourceLabel: input.sourceLabel,
            dedupKey: input.dedupKey ?? null,
          },
        });
      } catch (error) {
        // concurrent emissions collapse on the unique index; treat as already emitted
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
  });
  return { emitted: followers.length };
}

export async function listUpdateEventsForUser(
  prisma: PrismaInstance,
  userId: string,
  limit = 20,
): Promise<Array<{
  id: string;
  type: UpdateEventType;
  subjectType: SubjectType;
  subjectId: string;
  payload: unknown;
  occurredAt: Date;
  sourceLabel: string;
}>> {
  return prisma.updateEvent.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      subjectType: true,
      subjectId: true,
      payload: true,
      occurredAt: true,
      sourceLabel: true,
    },
  });
}
