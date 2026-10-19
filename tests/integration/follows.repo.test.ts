// M5 follows + update feed: the data surface behind step 5. Toggle
// semantics, owner scoping, and the emission that turns a census milestone
// into a row on a follower's update strip (public read of measured data,
// never an editorial score).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import {
  emitUpdateEvent,
  listUpdateEventsForUser,
  toggleFollow,
} from "@/server/follows";

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  throw new Error("TEST_DATABASE_URL not set; export it to run integration tests");
}

let prisma: PrismaInstance;

beforeAll(() => {
  prisma = createPrismaClient(TEST_URL);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("toggleFollow", () => {
  it("creates then removes a follow, scoped to the user", async () => {
    const user = await prisma.user.create({ data: { email: `follow-${RUN}@t.example` } });
    const first = await toggleFollow(prisma, user.id, { subjectType: "FRAGRANCE", subjectId: "frag-a" });
    expect(first.following).toBe(true);
    const second = await toggleFollow(prisma, user.id, { subjectType: "FRAGRANCE", subjectId: "frag-a" });
    expect(second.following).toBe(false);
    const count = await prisma.follow.count({ where: { userId: user.id } });
    expect(count).toBe(0);
  });

  it("never lets one user's toggle touch another user's follow", async () => {
    const a = await prisma.user.create({ data: { email: `follow-a-${RUN}@t.example` } });
    const b = await prisma.user.create({ data: { email: `follow-b-${RUN}@t.example` } });
    await toggleFollow(prisma, a.id, { subjectType: "HOUSE", subjectId: "h1" });
    const bCount = await prisma.follow.count({ where: { userId: b.id } });
    expect(bCount).toBe(0);
    // b toggles its own copy, not a's
    await toggleFollow(prisma, b.id, { subjectType: "HOUSE", subjectId: "h1" });
    expect(await prisma.follow.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma.follow.count({ where: { userId: b.id } })).toBe(1);
  });
});

describe("emitUpdateEvent", () => {
  it("writes one event per follower of the subject, with source label and occurredAt", async () => {
    const follower = await prisma.user.create({ data: { email: `ev-${RUN}@t.example` } });
    const other = await prisma.user.create({ data: { email: `ev2-${RUN}@t.example` } });
    await toggleFollow(prisma, follower.id, { subjectType: "FRAGRANCE", subjectId: "frag-x" });
    await toggleFollow(prisma, other.id, { subjectType: "FRAGRANCE", subjectId: "frag-y" });

    const result = await emitUpdateEvent(prisma, {
      subjectType: "FRAGRANCE",
      subjectId: "frag-x",
      type: "CENSUS_MILESTONE",
      payload: { sampleSize: 25, rankLevel: "confident" },
      sourceLabel: "the community",
      occurredAt: new Date("2026-10-19T12:00:00.000Z"),
    });
    expect(result.emitted).toBe(1);

    const events = await listUpdateEventsForUser(prisma, follower.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("CENSUS_MILESTONE");
    expect(events[0].sourceLabel).toBe("the community");
    expect((events[0].payload as { sampleSize: number }).sampleSize).toBe(25);
    // the non-follower gets nothing
    expect(await listUpdateEventsForUser(prisma, other.id)).toHaveLength(0);
  });

  it("never double-emits: a second call with the same dedup key is a no-op", async () => {
    const follower = await prisma.user.create({ data: { email: `dedup-${RUN}@t.example` } });
    await toggleFollow(prisma, follower.id, { subjectType: "FRAGRANCE", subjectId: "frag-d" });

    const first = await emitUpdateEvent(prisma, {
      subjectType: "FRAGRANCE",
      subjectId: "frag-d",
      type: "CENSUS_MILESTONE",
      payload: { sampleSize: 10, rankLevel: "low" },
      sourceLabel: "the community",
      occurredAt: new Date("2026-10-19T13:00:00.000Z"),
      dedupKey: "frag-d:milestone:10",
    });
    expect(first.emitted).toBe(1);

    const second = await emitUpdateEvent(prisma, {
      subjectType: "FRAGRANCE",
      subjectId: "frag-d",
      type: "CENSUS_MILESTONE",
      payload: { sampleSize: 10, rankLevel: "low" },
      sourceLabel: "the community",
      occurredAt: new Date("2026-10-19T13:00:00.000Z"),
      dedupKey: "frag-d:milestone:10",
    });
    expect(second.emitted).toBe(0);
    expect(await listUpdateEventsForUser(prisma, follower.id)).toHaveLength(1);
  });
});
