// M2 integration: price ingestion and the live worth pipeline against the
// real test DB. The honesty chain here is the whole point of M2: captures
// land with source/size/date, the domain estimate filters staleness, and
// shelf worth only ever sums what the data supports. Anything fake leaking
// into these tables would be caught by nothing but these tests, so they are
// not optional.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import {
  computeShelfWorth,
  ingestCaptures,
  loadMarketSource,
} from "@/server/marketData";
import { addItem } from "@/server/collection";
import type { PriceCapture } from "@/domain/types";

const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) {
  throw new Error("TEST_DATABASE_URL not set; export it to run integration tests");
}

const NOW = new Date("2026-10-19T12:00:00.000Z");
const daysAgoIso = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

let prisma: PrismaInstance;

beforeAll(() => {
  prisma = createPrismaClient(TEST_URL);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedFragrance(): Promise<string> {
  const house = await prisma.house.create({
    data: { name: `House ${crypto.randomUUID()}`, slug: `house-${crypto.randomUUID()}`, tier: "NICHE" },
  });
  const fragrance = await prisma.fragrance.create({
    data: { name: `Frag ${crypto.randomUUID()}`, slug: `frag-${crypto.randomUUID()}`, houseId: house.id },
  });
  return fragrance.id;
}

async function seedUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${crypto.randomUUID()}@test.local` },
  });
  return user.id;
}

describe("ingestCaptures", () => {
  it("refuses a capture whose date does not parse, instead of an Invalid Date insert error", async () => {
    const fragranceId = await seedFragrance();
    await expect(
      ingestCaptures(prisma, [
        { fragranceId, source: "EBAY_ASKING", priceCents: 9500, capturedAt: "not-a-date", sizeMl: 100 },
      ]),
    ).rejects.toThrow(/captured/i);
  });

  it("refuses a capture with no fragrance id or a future capture date", async () => {
    await expect(
      ingestCaptures(prisma, [
        { fragranceId: "", source: "EBAY_ASKING", priceCents: 9500, capturedAt: daysAgoIso(1), sizeMl: 100 },
      ]),
    ).rejects.toThrow(/fragrance/i);
    const fragranceId = await seedFragrance();
    await expect(
      ingestCaptures(prisma, [
        { fragranceId, source: "EBAY_ASKING", priceCents: 9500, capturedAt: "2099-01-01T00:00:00.000Z", sizeMl: 100 },
      ]),
    ).rejects.toThrow(/captured/i);
  });
  it("persists captures and round-trips them through loadMarketSource", async () => {
    const fragranceId = await seedFragrance();
    const captures: PriceCapture[] = [
      { fragranceId, source: "EBAY_ASKING", priceCents: 9500, capturedAt: daysAgoIso(1), sizeMl: 100 },
      { fragranceId, source: "EBAY_ASKING", priceCents: 11000, capturedAt: daysAgoIso(1), sizeMl: 100 },
    ];
    const inserted = await ingestCaptures(prisma, captures);
    expect(inserted).toBe(2);

    const source = await loadMarketSource(prisma, [fragranceId]);
    const points = source.pointsFor(fragranceId);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.priceCents).sort((a, b) => a - b)).toEqual([9500, 11000]);
    expect(points.every((p) => p.source === "EBAY_ASKING" && p.sizeMl === 100)).toBe(true);
  });

  it("keeps listing state fresh: re-ingesting a listing replaces its older row", async () => {
    const fragranceId = await seedFragrance();
    const listing = (over: { priceCents?: number; capturedAt?: string }): Array<PriceCapture & { sourceListingId: string }> => [
      {
        fragranceId,
        source: "EBAY_ASKING",
        priceCents: 10000,
        capturedAt: daysAgoIso(5),
        sizeMl: 100,
        sourceListingId: "ebay-42",
        ...over,
      },
    ];

    await ingestCaptures(prisma, listing({}));
    await ingestCaptures(prisma, listing({ priceCents: 14000, capturedAt: daysAgoIso(0) }));

    const source = await loadMarketSource(prisma, [fragranceId]);
    const sellerStream = source.pointsFor(fragranceId);
    expect(sellerStream).toHaveLength(1);
    expect(sellerStream[0].priceCents).toBe(14000);
  });

  it("keeps samples without listing ids as independent points", async () => {
    const fragranceId = await seedFragrance();
    await ingestCaptures(prisma, [
      { fragranceId, source: "EBAY_ASKING", priceCents: 9000, capturedAt: daysAgoIso(2), sizeMl: 50 },
      { fragranceId, source: "EBAY_ASKING", priceCents: 9200, capturedAt: daysAgoIso(1), sizeMl: 50 },
    ]);
    const source = await loadMarketSource(prisma, [fragranceId]);
    const points = source.pointsFor(fragranceId);
    expect(points).toHaveLength(2);
  });
});

describe("computeShelfWorth (live pipeline)", () => {
  it("prices a bottle from stored captures, staleness honored end to end", async () => {
    const fragranceId = await seedFragrance();
    const userId = await seedUser();
    const captures: PriceCapture[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        fragranceId,
        source: "EBAY_ASKING" as const,
        priceCents: 10000 + i * 100,
        capturedAt: daysAgoIso(1),
        sizeMl: 100,
      })),
      { fragranceId, source: "EBAY_ASKING", priceCents: 999999, capturedAt: daysAgoIso(31), sizeMl: 100 },
    ];
    await ingestCaptures(prisma, captures);
    await addItem(prisma, userId, { fragranceId, sizeMl: 100, pricePaidCents: 12000 });

    const summary = await computeShelfWorth(prisma, userId, NOW);
    expect(summary.bottlesWithMarket).toBe(1);
    expect(summary.bottles[0].status).toBe("confident");
    // the stale $9,999 row is excluded: no 6-figure range can appear
    expect(summary.bottles[0].highCents).toBeLessThan(100000);
  });

  it("returns none-status bottles when the database truly has no rows", async () => {
    const fragranceId = await seedFragrance();
    const userId = await seedUser();
    await addItem(prisma, userId, { fragranceId, sizeMl: 50, pricePaidCents: 5000 });

    const summary = await computeShelfWorth(prisma, userId, NOW);
    expect(summary.bottles[0].status).toBe("none");
    expect(summary.totalWorthCents).toBeNull();
    expect(summary.costBasisCents).toBe(5000);
    expect(summary.deltaCents).toBeNull();
  });

  it("mixed sizes on one shelf get their own groups, never blended", async () => {
    const fragranceId = await seedFragrance();
    const userId = await seedUser();
    const fresh = Array.from({ length: 13 }, (_, i) => ({
      fragranceId,
      source: "EBAY_ASKING" as const,
      priceCents: 20000 + i,
      capturedAt: daysAgoIso(1),
      sizeMl: 100,
    }));
    const small = Array.from({ length: 13 }, (_, i) => ({
      fragranceId,
      source: "EBAY_ASKING" as const,
      priceCents: 7000 + i,
      capturedAt: daysAgoIso(1),
      sizeMl: 30,
    }));
    await ingestCaptures(prisma, [...fresh, ...small]);
    await addItem(prisma, userId, { fragranceId, sizeMl: 100 });
    await addItem(prisma, userId, { fragranceId, sizeMl: 30 });

    const summary = await computeShelfWorth(prisma, userId, NOW);
    expect(summary.bottlesWithMarket).toBe(2);
    // 100ml mids around $200; 30ml mids around $70; far apart, both present
    const worth = summary.totalWorthCents;
    if (!worth) throw new Error("expected a worth range with two priced bottles");
    expect(worth.mid).toBeGreaterThan(20000);
    expect(worth.mid).toBeLessThan(30000);
    expect(summary.bottles.find((b) => b.status === "confident")).toBeTruthy();
  });
});
