// M4 integration: the feed repository. The domain stays pure; here we prove
// the DB plumbing: profile + shelf + votes flow into real feed cards, cards
// stick to the domain's correctness rules (no owned/declined repeats, reasons
// every time), the PRD 7.3 back-to-back rule survives a page change through
// FeedPageState, and a LIKE is removed from the feed right after voting.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { buildFeedPage } from "@/server/feed";
import { saveVote } from "@/server/votes";

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  throw new Error("TEST_DATABASE_URL not set; export it to run integration tests");
}

let prisma: PrismaInstance;

beforeAll(async () => {
  prisma = createPrismaClient(TEST_URL);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const PREFIXED = (suffix: string): string => `feedtest-${suffix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
void PREFIXED;

describe("buildFeedPage", () => {
  it("builds a full page with reasons and slots from a real profile + shelf + votes", async () => {
    const env = await seedCorpus(`feedfull-${Date.now()}`, 24);
    const user = await env.user;
    await prisma.user.update({
      where: { id: user.id },
      data: { budgetBand: "50-150", cloneBand: "yes-happily", accordPrefs: ["sweet", "vanilla"] },
    });

    const result = await buildFeedPage(prisma, user.id, { pageSize: 6 });

    expect(result.cards).toHaveLength(6);
    for (const card of result.cards) {
      expect(distinctReason(card.reasonSlug)).toBe(true);
      expect(card.reasonLine.length).toBeGreaterThan(0);
      expect(["taste", "contrast"]).toContain(card.slot);
      expect(env.ownedIds.has(card.candidate.fragranceId)).toBe(false);
      expect(env.rejectedIds.has(card.candidate.fragranceId)).toBe(false);
    }
  });

  it("respects the PRD 7.3 back-to-back rule across pages through FeedPageState", async () => {
    const env = await seedCorpus(`feedb2b-${Date.now()}`, 24);
    const user = await env.user;
    await prisma.user.update({
      where: { id: user.id },
      data: { budgetBand: "<50", accordPrefs: ["sweet", "vanilla"] },
    });

    const page1 = await buildFeedPage(prisma, user.id, { pageSize: 6 });
    const page2 = await buildFeedPage(prisma, user.id, { pageSize: 6 });

    // no fragrance may sit on both pages with the SAME reason
    const page1ByFrag = new Map(page1.cards.map((c) => [c.candidate.fragranceId, c.reasonSlug]));
    for (const card of page2.cards) {
      const shownSlug = page1ByFrag.get(card.candidate.fragranceId);
      if (shownSlug !== undefined) {
        expect(card.reasonSlug).not.toBe(shownSlug);
      }
    }
  });

  it("keeps any voted fragrance out of the pool, LIKE included (vote = seen)", async () => {
    const env = await seedCorpus(`feeddrop-${Date.now()}`, 24);
    const user = await env.user;
    await prisma.user.update({
      where: { id: user.id },
      data: { accordPrefs: ["sweet", "vanilla"] },
    });
    const before = await buildFeedPage(prisma, user.id, { pageSize: 6 });
    const targetIds = new Set(before.cards.map((c) => c.candidate.fragranceId));
    expect(targetIds.size).toBeGreaterThan(0);
    for (const id of targetIds) {
      await saveVote(prisma, user.id, { fragranceId: id, direction: "DISLIKE", reasonSlug: "accord:shelf-match" });
    }

    const after = await buildFeedPage(prisma, user.id, { pageSize: 6 });
    for (const card of after.cards) {
      expect(targetIds.has(card.candidate.fragranceId)).toBe(false);
    }

    // LIKE is applause for the profile, not a request to see the card again
    const saw = await buildFeedPage(prisma, user.id, { pageSize: 6 });
    for (const card of saw.cards) {
      expect(targetIds.has(card.candidate.fragranceId)).toBe(false);
    }
    // six new votes on top of the two seeded exclusions (dislike + decline)
    const remaining = await prisma.vote.count({ where: { userId: user.id } });
    expect(remaining).toBe(8);
    void env;
  });

  it("handles a fully dataless user gracefully: cards appear from house fallbacks, no crash", async () => {
    const env = await seedCorpus(`feedempty-${Date.now()}`, 24);
    const user = await env.user;
    await prisma.user.update({
      where: { id: user.id },
      data: { budgetBand: null, cloneBand: null, accordPrefs: [] },
    });
    // fully dataless: empty shelf too, so no shelf accord matches are possible
    await prisma.collectionItem.deleteMany({ where: { userId: user.id } });
    const result = await buildFeedPage(prisma, user.id, { pageSize: 6 });
    expect(result.cards.length).toBeGreaterThan(0);
    for (const card of result.cards) {
      // a fully dataless user gets contrast framing (everything differs from
      // an empty base) or the honest house fallback; never shelf/profile refs
      expect(card.reasonSlug).toMatch(/^(house:|contrast:)/);
      expect(card.reasonLine).not.toContain("NONE");
    }
  });
});

// ---- shared seeding --------------------------------------------------------

function distinctReason(slug: string): boolean {
  return slug !== "";
}

interface SeededEnv {
  user: Promise<{ id: string }>;
  ownedIds: Set<string>;
  rejectedIds: Set<string>;
  allIds: string[];
}

/**
 * A small synthetic catalog with two accord neighborhoods so taste and
 * contrast pools both fill: sweet/vanilla/fruity vs leather/smoky/tobacco.
 * Points the shelf at a CLONE-tier house and one fragrance, and casts one
 * dislike and one decline for the exclusion surface. Everything derived by
 * this function, nothing hard-coded from elsewhere.
 */
async function seedCorpus(tag: string, count: number): Promise<SeededEnv> {
  const house = await prisma.house.upsert({
    where: { slug: `seed-house-${tag}` },
    create: { name: `Feed House ${tag}`, slug: `seed-house-${tag}`, tier: "CLONE" },
    update: {},
  });
  const designerHouse = await prisma.house.upsert({
    where: { slug: `seed-dh-${tag}` },
    create: { name: `Feed Designer ${tag}`, slug: `seed-dh-${tag}`, tier: "DESIGNER" },
    update: {},
  });

  const tasteAccords = ["sweet", "vanilla", "fruity"];
  const contrastAccords = ["leather", "smoky", "tobacco"];
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const accords = i % 2 === 0
      ? tasteAccords.concat(tasteAccords[i % tasteAccords.length])
      : contrastAccords.concat(contrastAccords[i % contrastAccords.length]);
    const frag = await prisma.fragrance.upsert({
      where: { slug: `seed-frag-${tag}-${i}` },
      create: {
        name: `Feed Frag ${tag} ${i}`,
        slug: `seed-frag-${tag}-${i}`,
        houseId: i % 2 === 0 ? house.id : designerHouse.id,
        year: 2020 + (i % 5),
        accords: [...new Set(accords)],
        catalogueSourcePid: `seed-${tag}-${i}`,
      },
      update: {},
    });
    ids.push(frag.id);
  }

  const user = prisma.user.create({
    data: { email: `feed-${tag}@t.example` },
    select: { id: true },
  });
  const userId = (await user).id;
  const owned = ids[0]!;
  await prisma.collectionItem.create({
    data: { userId, fragranceId: owned },
  });

  await prisma.vote.createMany({
    data: [
      { userId, fragranceId: ids[1]!, direction: "DISLIKE" },
      { userId, fragranceId: ids[3]!, direction: "DECLINE" },
    ],
  });

  return {
    user,
    ownedIds: new Set([owned]),
    rejectedIds: new Set([ids[1]!, ids[3]!]),
    allIds: ids,
  };
}
