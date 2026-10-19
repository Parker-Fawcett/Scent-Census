// M4 integration: the votes repository. The domain validator stays pure; here
// we prove PERSISTENCE semantics: owner-scoped (one row per user+fragrance),
// revisionable (re-vote replaces direction), and the feed's rejected surface
// (every non-LIKE vote, with the fragrance's community accords).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { loadRejectedForFeed, saveVote } from "@/server/votes";

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

describe("saveVote", () => {
  it("stores a vote scoped to user + fragrance with the shown reason", async () => {
    const user = await prisma.user.create({
      data: { email: `votes-${Date.now()}@t.example`, },
    });
    const fragrance = await seedFrag("votes-frag-1", "Sweet Vanilla Test");
    await saveVote(prisma, user.id, {
      fragranceId: fragrance.id,
      direction: "LIKE",
      reasonSlug: "accord:shelf-match",
    });

    const row = await prisma.vote.findUnique({
      where: { userId_fragranceId: { userId: user.id, fragranceId: fragrance.id } },
    });
    expect(row).not.toBeNull();
    expect(row!.direction).toBe("LIKE");
    expect(row!.reasonSlug).toBe("accord:shelf-match");
  });

  it("revises: a second vote replaces direction and reason on the same row", async () => {
    const user = await prisma.user.create({
      data: { email: `revise-${Date.now()}@t.example` },
    });
    const fragrance = await seedFrag("revise-frag-1", "Revision Frag");
    await saveVote(prisma, user.id, { fragranceId: fragrance.id, direction: "LIKE" });
    await saveVote(prisma, user.id, { fragranceId: fragrance.id, direction: "DECLINE", reasonSlug: "house:clone-tier" });

    const count = await prisma.vote.count({ where: { userId: user.id } });
    expect(count).toBe(1);
    const row = await prisma.vote.findUnique({
      where: { userId_fragranceId: { userId: user.id, fragranceId: fragrance.id } },
    });
    expect(row!.direction).toBe("DECLINE");
    expect(row!.reasonSlug).toBe("house:clone-tier");
  });

  it("refuses unknown directions (bogus client calls die loudly)", async () => {
    const user = await prisma.user.create({
      data: { email: `bogus-${Date.now()}@t.example` },
    });
    const fragrance = await seedFrag("bogus-frag-1", "Bogus Frag");
    await expect(
      saveVote(prisma, user.id, { fragranceId: fragrance.id, direction: "MAGNETIC" as "LIKE" }),
    ).rejects.toThrow(/unknown direction/);
  });

  it("refuses a blank reason slug while allowing an omitted one", async () => {
    const user = await prisma.user.create({
      data: { email: `blank-${Date.now()}@t.example` },
    });
    const fragrance = await seedFrag("blank-frag-1", "Blank Reason Frag");
    await expect(
      saveVote(prisma, user.id, { fragranceId: fragrance.id, direction: "LIKE", reasonSlug: "   " }),
    ).rejects.toThrow(/blank/);
    await saveVote(prisma, user.id, { fragranceId: fragrance.id, direction: "LIKE" });
  });
});

describe("loadRejectedForFeed", () => {
  it("returns every non-LIKE vote with community accords, and keeps LIKEs out", async () => {
    const user = await prisma.user.create({
      data: { email: `reject-${Date.now()}@t.example` },
    });
    const liked = await seedFrag("reject-like", "Liked Frag", ["sweet", "vanilla"]);
    const disliked = await seedFrag("reject-dislike", "Disliked Frag", ["smoky", "leather"]);
    const declined = await seedFrag("reject-decline", "Declined Frag", ["aquatic"]);
    await seedFrag("reject-unused", "Irrelevant Frag", ["green"]);
    await saveVote(prisma, user.id, { fragranceId: liked.id, direction: "LIKE" });
    await saveVote(prisma, user.id, { fragranceId: disliked.id, direction: "DISLIKE" });
    await saveVote(prisma, user.id, { fragranceId: declined.id, direction: "DECLINE" });

    const rejected = await loadRejectedForFeed(prisma, user.id);
    const byId = new Map(rejected.map((r) => [r.fragranceId, r]));
    expect(rejected).toHaveLength(2);
    expect(byId.get(disliked.id)!.direction).toBe("DISLIKE");
    expect(byId.get(disliked.id)!.accordNames).toEqual(["smoky", "leather"]);
    expect(byId.get(declined.id)!.direction).toBe("DECLINE");
    expect(byId.has(liked.id)).toBe(false);
  });
});

async function seedFrag(pid: string, name: string, accords: string[] = []): Promise<{ id: string }> {
  const house = await prisma.house.upsert({
    where: { slug: `votes-test-house` },
    create: { name: "Votes Test House", slug: "votes-test-house", tier: "DESIGNER" },
    update: {},
  });
  return prisma.fragrance.upsert({
    where: { slug: pid },
    create: { name, slug: pid, houseId: house.id, year: 2020, accords },
    update: { accords },
  });
}
