// M5 creator claim integration: token minting/verification, the claim that
// binds a creator to a user, and the creator's own review/pickup logging.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { claimCreator, logCreatorPickup, mintClaimToken, verifyCreator } from "@/server/creators";

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

async function seedCreator(slug: string): Promise<{ id: string }> {
  return prisma.creator.create({
    data: { slug: `${slug}-${RUN}`, name: `Creator ${slug} ${RUN}`, platforms: {}, status: "UNCLAIMED" },
  });
}

async function seedFrag(pid: string, name: string): Promise<{ id: string }> {
  const house = await prisma.house.upsert({
    where: { slug: "creator-test-house" },
    create: { name: "Creator Test House", slug: "creator-test-house", tier: "DESIGNER" },
    update: {},
  });
  return prisma.fragrance.upsert({
    where: { slug: `${pid}-${RUN}` },
    create: { name, slug: `${pid}-${RUN}`, houseId: house.id, year: 2024, accords: [] },
    update: {},
  });
}

describe("claimCreator", () => {
  it("binds an unclaimed creator to the user with a valid token and flips status to CLAIMED", async () => {
    const creator = await seedCreator("claim");
    const user = await prisma.user.create({ data: { email: `claim-${RUN}@t.example` } });
    const token = mintClaimToken(creator.id);

    const result = await claimCreator(prisma, user.id, token);
    expect(result.claimed).toBe(true);
    const row = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } });
    expect(result.creatorSlug).toBe(row.slug);
    expect(row.claimedById).toBe(user.id);
    expect(row.status).toBe("CLAIMED");
  });

  it("refuses an expired or tampered token", async () => {
    const creator = await seedCreator("tamper");
    const user = await prisma.user.create({ data: { email: `tamper-${RUN}@t.example` } });
    const token = mintClaimToken(creator.id);
    // tamper the payload by flipping a character in the body
    const [body, sig] = token.split(".");
    const flipped = body.slice(0, -1) + (body.endsWith("a") ? "b" : "a");
    const tampered = `${flipped}.${sig}`;
    const result = await claimCreator(prisma, user.id, tampered);
    expect(result.claimed).toBe(false);
    expect(result.reason).toMatch(/invalid/i);

    // a second user cannot claim an already-claimed creator
    const firstUser = await prisma.user.create({ data: { email: `first-${RUN}@t.example` } });
    const secondUser = await prisma.user.create({ data: { email: `second-${RUN}@t.example` } });
    const c2 = await seedCreator("claimed");
    const t2 = mintClaimToken(c2.id);
    await claimCreator(prisma, firstUser.id, t2);
    const denied = await claimCreator(prisma, secondUser.id, t2);
    expect(denied.claimed).toBe(false);
    expect(denied.reason).toMatch(/already/i);
  });

  it("verifyCreator moves a claimed creator to VERIFIED", async () => {
    const creator = await seedCreator("verify");
    const user = await prisma.user.create({ data: { email: `verify-${RUN}@t.example` } });
    await claimCreator(prisma, user.id, mintClaimToken(creator.id));
    await verifyCreator(prisma, creator.id);
    const row = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } });
    expect(row.status).toBe("VERIFIED");
  });
});

describe("logCreatorPickup", () => {
  it("only the claiming account may log, and the row is queryable per fragrance", async () => {
    const creator = await seedCreator("log");
    const owner = await prisma.user.create({ data: { email: `owner-${RUN}@t.example` } });
    const stranger = await prisma.user.create({ data: { email: `stranger-${RUN}@t.example` } });
    const frag = await seedFrag("log-frag", "Logged Fragrance");
    await claimCreator(prisma, owner.id, mintClaimToken(creator.id));

    await logCreatorPickup(prisma, owner.id, {
      creatorId: creator.id,
      fragranceId: frag.id,
      url: "https://youtube.com/watch?v=abc",
      title: "Is this worth it? (review)",
    });

    await expect(
      logCreatorPickup(prisma, stranger.id, { creatorId: creator.id, fragranceId: frag.id, url: "https://x" }),
    ).rejects.toThrow(/only the claiming/i);

    const { listCreatorPickupsForFragrance } = await import("@/server/creators");
    const pickups = await listCreatorPickupsForFragrance(prisma, frag.id);
    expect(pickups).toHaveLength(1);
    expect(pickups[0].title).toBe("Is this worth it? (review)");
    expect(pickups[0].url).toBe("https://youtube.com/watch?v=abc");
    const creatorRow = await prisma.creator.findUniqueOrThrow({ where: { id: creator.id } });
    expect(pickups[0].creatorName).toBe(creatorRow.name);
  });

  it("refuses an empty url or an unknown fragrance", async () => {
    const creator = await seedCreator("validate");
    const owner = await prisma.user.create({ data: { email: `owner2-${RUN}@t.example` } });
    const frag = await seedFrag("valid-frag", "Valid Fragrance");
    await claimCreator(prisma, owner.id, mintClaimToken(creator.id));
    await expect(
      logCreatorPickup(prisma, owner.id, { creatorId: creator.id, fragranceId: frag.id, url: "   " }),
    ).rejects.toThrow(/url is required/i);
    await expect(
      logCreatorPickup(prisma, owner.id, { creatorId: creator.id, fragranceId: "no-such-frag", url: "https://x" }),
    ).rejects.toThrow(/unknown fragrance/i);
  });
});
