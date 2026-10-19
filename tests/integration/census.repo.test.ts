// M5 integration: the clone census repository. The rollup MATH is proven in
// the domain (census.test.ts); these tests pin the PERSISTENCE side: a vote
// upserts per user+pair, every save recomputes the pair's materialized
// rollup in the same transaction, the rank-level floors (10 low / 25
// confident) come from floors.ts and not from hardcoding, and revotes or
// clears shrink the rollup instead of leaving stale materialized numbers.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import {
  clearCloneVoteForUser,
  loadPairRollup,
  loadRankedClones,
  recomputePairRollup,
  saveCloneVote,
} from "@/server/census";

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

const email = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@t.example`;
// every run gets fresh catalogue rows: leftover votes from an earlier run
// would otherwise dominate the rollups these assertions read
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const userFor = async (tag: string) =>
  prisma.user.create({ data: { email: email(`${RUN}-${tag}`) } });
const seedFrag = async (pid: string, name: string): Promise<{ id: string }> => {
  const slug = `${pid}-${RUN}`;
  const house = await prisma.house.upsert({
    where: { slug: "census-test-house" },
    create: { name: "Census Test House", slug: "census-test-house", tier: "CLONE" },
    update: {},
  });
  const targetHouse = await prisma.house.upsert({
    where: { slug: "census-test-house-designer" },
    create: { name: "Census Test House Designer", slug: "census-test-house-designer", tier: "DESIGNER" },
    update: {},
  });
  return prisma.fragrance.upsert({
    where: { slug },
    create: {
      name,
      slug,
      houseId: pid.startsWith("target") ? targetHouse.id : house.id,
      year: 2020,
      accords: [],
    },
    update: {},
  });
};

describe("saveCloneVote", () => {
  it("stores a vote per user+pair and materializes the rollup in the same call", async () => {
    const user = await userFor("c1");
    const clone = await seedFrag("census-clone-a", "Clone Alpha");
    const target = await seedFrag("census-target-a", "Target Alpha");

    await saveCloneVote(prisma, user.id, { cloneId: clone.id, targetId: target.id, bucket: "CLOSE" });

    const saved = await prisma.cloneVote.findUnique({
      where: { userId_cloneId_targetId: { userId: user.id, cloneId: clone.id, targetId: target.id } },
    });
    expect(saved?.bucket).toBe("CLOSE");

    const rollup = await loadPairRollup(prisma, clone.id, target.id);
    expect(rollup).not.toBeNull();
    expect(rollup!.sampleSize).toBe(1);
    expect(rollup!.rankLevel).toBe("none"); // 1 vote is under the 10-vote floor
    expect(rollup!.mostCommon).toBe("CLOSE");
  });

  it("a revote replaces the row and the rollup, never appends", async () => {
    const user = await userFor("c2");
    const clone = await seedFrag("census-clone-b", "Clone Beta");
    const target = await seedFrag("census-target-b", "Target Beta");

    await saveCloneVote(prisma, user.id, { cloneId: clone.id, targetId: target.id, bucket: "SPOT_ON" });
    await saveCloneVote(prisma, user.id, { cloneId: clone.id, targetId: target.id, bucket: "NOT_CLOSE" });

    const votes = await prisma.cloneVote.findMany({ where: { cloneId: clone.id, targetId: target.id } });
    expect(votes).toHaveLength(1);
    expect(votes[0].bucket).toBe("NOT_CLOSE");
    const rollup = (await loadPairRollup(prisma, clone.id, target.id))!;
    expect(rollup.mostCommon).toBe("NOT_CLOSE");
    expect(rollup.score).toBe(10); // NOT_CLOSE packs 10 of 100
  });

  it("refuses self-pairs and unknown fragrances loud", async () => {
    const user = await userFor("c3");
    const clone = await seedFrag("census-clone-c", "Clone Gamma");
    await expect(
      saveCloneVote(prisma, user.id, { cloneId: clone.id, targetId: clone.id, bucket: "CLOSE" }),
    ).rejects.toThrow(/itself/i);
    await expect(
      saveCloneVote(prisma, user.id, { cloneId: clone.id, targetId: "missing-target", bucket: "CLOSE" }),
    ).rejects.toThrow(/unknown/i);
    await expect(
      saveCloneVote(prisma, user.id, { cloneId: "missing-clone", targetId: clone.id, bucket: "CLOSE" }),
    ).rejects.toThrow(/unknown/i);
  });
});

describe("rank-level floors (PRD 7.6: two confidence levels)", () => {
  it("9 votes stay unranked, 10 enter low, 25 recover the confident label", async () => {
    const clone = await seedFrag("census-clone-floors", "Floor Walker");
    const target = await seedFrag("census-target-floors", "Floor Target");

    const seed = async (n: number) => {
      for (let i = 0; i < n; i += 1) {
        const voter = await userFor(`floor-${i}`);
        await prisma.cloneVote.create({
          data: { userId: voter.id, cloneId: clone.id, targetId: target.id, bucket: "SIMILAR" },
        });
      }
    };

    await seed(9);
    await recomputePairRollup(prisma, clone.id, target.id);
    expect((await loadPairRollup(prisma, clone.id, target.id))!.rankLevel).toBe("none");

    const voter10 = await userFor("floor-10");
    await saveCloneVote(prisma, voter10.id, { cloneId: clone.id, targetId: target.id, bucket: "SIMILAR" });
    expect((await loadPairRollup(prisma, clone.id, target.id))!.rankLevel).toBe("low");

    // fetch the rollup row for direct vote inserts + recalculated state
    for (let i = 11; i <= 25; i += 1) {
      const voter = await userFor(`floor-more-${i}`);
      await prisma.cloneVote.create({
        data: { userId: voter.id, cloneId: clone.id, targetId: target.id, bucket: "SIMILAR" },
      });
    }
    await recomputePairRollup(prisma, clone.id, target.id);
    expect((await loadPairRollup(prisma, clone.id, target.id))!.rankLevel).toBe("confident");
    expect((await loadPairRollup(prisma, clone.id, target.id))!.sampleSize).toBe(25);
  });
});

describe("clearCloneVoteForUser", () => {
  it("deletes only that user's vote on that pair and shrinks the rollup", async () => {
    const a = await userFor("clear-a");
    const b = await userFor("clear-b");
    const clone = await seedFrag("census-clone-clear", "Clear Clone");
    const target = await seedFrag("census-target-clear", "Clear Target");
    await saveCloneVote(prisma, a.id, { cloneId: clone.id, targetId: target.id, bucket: "SPOT_ON" });
    await saveCloneVote(prisma, b.id, { cloneId: clone.id, targetId: target.id, bucket: "SPOT_ON" });
    expect((await loadPairRollup(prisma, clone.id, target.id))!.sampleSize).toBe(2);

    await clearCloneVoteForUser(prisma, a.id, clone.id, target.id);
    expect(await prisma.cloneVote.count({ where: { cloneId: clone.id, targetId: target.id } })).toBe(1);
    expect((await loadPairRollup(prisma, clone.id, target.id))!.sampleSize).toBe(1);
  });

  it("clearing the last vote returns an explicit unranked state, never a ghost rollup", async () => {
    const user = await userFor("clear-last");
    const clone = await seedFrag("census-clone-last", "Last Clone");
    const target = await seedFrag("census-target-last", "Last Target");
    await saveCloneVote(prisma, user.id, { cloneId: clone.id, targetId: target.id, bucket: "CLOSE" });
    await clearCloneVoteForUser(prisma, user.id, clone.id, target.id);

    const rollup = await loadPairRollup(prisma, clone.id, target.id);
    expect(rollup!.sampleSize).toBe(0);
    expect(rollup!.rankLevel).toBe("none");
  });
});

describe("loadRankedClones", () => {
  it("orders by the domain rules: rank level first, then score, ties stable and alphabetical", async () => {
    const target = await seedFrag("census-target-rank", "Ranked Target");
    const strong = await seedFrag("census-clone-zeta", "Zeta Clone");
    const weak = await seedFrag("census-clone-alpha", "Alpha Clone");
    const tiedA = await seedFrag("census-clone-bravo", "Bravo Clone");
    const tiedB = await seedFrag("census-clone-echo", "Echo Clone");
    const unrated = await seedFrag("census-clone-novote", "No Vote Clone");

    // 25 SPOT_ON voters for strong (score 95, confident level)
    for (let i = 0; i < 25; i += 1) {
      const voter = await userFor(`rank-strong-${i}`);
      await prisma.cloneVote.create({
        data: { userId: voter.id, cloneId: strong.id, targetId: target.id, bucket: "SPOT_ON" },
      });
    }
    // 10 SIMILAR voters for weak (score 60, low)
    for (let i = 0; i < 10; i += 1) {
      const voter = await userFor(`rank-weak-${i}`);
      await prisma.cloneVote.create({
        data: { userId: voter.id, cloneId: weak.id, targetId: target.id, bucket: "SIMILAR" },
      });
    }
    // 10 CLOSE voters each for the tied pair (score 80 in the tie band)
    for (const pair of [
      [tiedA, "bravo"],
      [tiedB, "echo"],
    ] as const) {
      for (let i = 0; i < 10; i += 1) {
        const voter = await userFor(`rank-tie-${pair[1]}-${i}`);
        await prisma.cloneVote.create({
          data: { userId: voter.id, cloneId: pair[0].id, targetId: target.id, bucket: "CLOSE" },
        });
      }
    }
    for (const frag of [strong, weak, tiedA, tiedB]) {
      await recomputePairRollup(prisma, frag.id, target.id);
    }
    // the unvoted clone's membership comes from curation (its inspiredBy
    // edge), which is the same union a real census page will use
    await prisma.fragrance.update({ where: { id: unrated.id }, data: { inspiredById: target.id } });

    const ranked = await loadRankedClones(prisma, target.id);
    const names = ranked.map((r) => r.cloneName);
    // confident beats low and none; within the tie band alphabetical; the
    // unvoted clone still appears (sampleSize 0, labelled unranked) last
    expect(names[0]).toBe("Zeta Clone");
    expect(names.slice(1, 3)).toEqual(["Bravo Clone", "Echo Clone"]); // 80 vs 80, alpha order
    expect(names[3]).toBe("Alpha Clone"); // 60
    expect(names).toContain("No Vote Clone"); // unranked tail, not dropped
    expect(ranked.find((r) => r.cloneName === "Alpha Clone")!.rankLevel).toBe("low");
    expect(ranked.find((r) => r.cloneName === "No Vote Clone")!.sampleSize).toBe(0);
  });
});
