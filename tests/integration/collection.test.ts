// M2 integration: the collection repository against the real postgres test DB
// (docker-compose db-test, migrated by `npm run test:integration`). These run
// the migration first, so schema drift fails here before it can reach a user's
// shelf. TEST_DATABASE_URL must be exported; the test dies loudly without it.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { addItem, listCollection, removeItem } from "@/server/collection";

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  throw new Error(
    "TEST_DATABASE_URL not set; docker compose up -d, then export TEST_DATABASE_URL",
  );
}

let prisma: PrismaInstance;

beforeAll(() => {
  prisma = createPrismaClient(TEST_URL);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seed(): Promise<{ userId: string; fragranceId: string }> {
  const house = await prisma.house.create({
    data: { name: `House ${crypto.randomUUID()}`, slug: `house-${crypto.randomUUID()}`, tier: "NICHE" },
  });
  const fragrance = await prisma.fragrance.create({
    data: { name: `Frag ${crypto.randomUUID()}`, slug: `frag-${crypto.randomUUID()}`, houseId: house.id },
  });
  const user = await prisma.user.create({ data: { email: `${crypto.randomUUID()}@test.local` } });
  return { userId: user.id, fragranceId: fragrance.id };
}

describe("collection repository", () => {
  it("adds a bottle and lists it with its fragrance and house joined", async () => {
    const { userId, fragranceId } = await seed();
    const item = await addItem(prisma, userId, {
      fragranceId,
      sizeMl: 100,
      batchCode: "A1-XXXX",
      pricePaidCents: 12000,
      purchasedOn: new Date("2026-01-15"),
      sealed: false,
    });
    const shelf = await listCollection(prisma, userId);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].id).toBe(item.id);
    expect(shelf[0].sizeMl).toBe(100);
    expect(shelf[0].pricePaidCents).toBe(12000);
    expect(shelf[0].fragrance.name).toBeTruthy();
    expect(shelf[0].fragrance.house.name).toBeTruthy();
  });

  it("supports a shelf with zero bottles as a real empty result", async () => {
    const { userId } = await seed();
    expect(await listCollection(prisma, userId)).toEqual([]);
  });

  it("removes a bottle and only the owner's bottle", async () => {
    const { userId, fragranceId } = await seed();
    const item = await addItem(prisma, userId, { fragranceId, sizeMl: 30 });
    const stranger = (await seed()).userId;

    await expect(removeItem(prisma, stranger, item.id)).rejects.toThrow();
    expect(await listCollection(prisma, userId)).toHaveLength(1);

    await removeItem(prisma, userId, item.id);
    expect(await listCollection(prisma, userId)).toEqual([]);
  });

  it("refuses to attach a bottle to a fragrance that does not exist", async () => {
    const { userId } = await seed();
    await expect(
      addItem(prisma, userId, { fragranceId: "nope", sizeMl: 100 }),
    ).rejects.toThrow(/constraint|foreign|invalid/i);
  });
});
