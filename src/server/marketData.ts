// Price ingestion and the live worth pipeline for the M2 collection (PRD
// section 7.2 + section 8). Captures carry source, bottle size, capture date,
// and their listing id; ingesting the same listing again REPLACES its older
// row so a repriced eBay listing cannot be double counted. Shelf worth is
// computed with one bulk preload per set of fragrances: the domain seam stays
// synchronous, so the DB adapter is a preloaded deterministic source, the
// same discipline as the test fake.

import type { PriceCapture } from "@/domain/types";
import { estimateFromSource } from "@/domain/marketSources";
import {
  shelfWorth,
  type ShelfFragranceInput,
  type ShelfSummary,
} from "@/domain/worth";
import { listCollection } from "./collection";
import type { PrismaInstance } from "@/lib/prisma";

export interface MarketSourceSets {
  pointsFor(fragranceId: string): PriceCapture[];
}

export async function ingestCaptures(
  prisma: PrismaInstance,
  captures: Array<PriceCapture & { sourceListingId?: string }>,
): Promise<number> {
  if (captures.length === 0) return 0;
  return prisma.$transaction(async (tx) => {
    for (const capture of captures) {
      if (!Number.isInteger(capture.priceCents) || capture.priceCents <= 0) {
        throw new Error(
          `ingest refused: non-positive or non-integer price ${capture.priceCents} (fragrance ${capture.fragranceId})`,
        );
      }
      if (capture.fragranceId.trim() === "") {
        throw new Error("ingest refused: an empty fragrance id (every capture must name its fragrance)");
      }
      // an unparseable or future-dated capture would either crash the insert
      // with an Invalid Date error or poison the staleness window with data
      // from tomorrow; both are suspect-data situations, so refuse loud
      if (
        Number.isNaN(new Date(capture.capturedAt).getTime()) ||
        new Date(capture.capturedAt).getTime() > Date.now()
      ) {
        throw new Error(
          `ingest refused: capturedAt "${capture.capturedAt}" is unparseable or future-dated (fragrance ${capture.fragranceId})`,
        );
      }
    }
    // latest state of each listing wins: delete prior rows by listing id,
    // only when the capture actually named one (samples without ids are
    // independent points and accumulate)
    const listingIds = [
      ...new Set(
        captures
          .map((c) => c.sourceListingId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    if (listingIds.length > 0) {
      await tx.pricePoint.deleteMany({
        where: {
          sourceListingId: { in: listingIds },
          // listing ids are only unique per source; scoping by source keeps a
          // pid-shaped id in one feed from deleting rows in another
          source: { in: [...new Set(captures.filter((c) => c.sourceListingId !== undefined).map((c) => c.source))] },
        },
      });
    }
    for (const capture of captures) {
      await tx.pricePoint.create({
        data: {
          fragranceId: capture.fragranceId,
          source: capture.source,
          priceCents: capture.priceCents,
          capturedAt: new Date(capture.capturedAt),
          sizeMl: capture.sizeMl ?? null,
          sourceListingId: capture.sourceListingId ?? null,
        },
      });
    }
    return captures.length;
  });
}

export async function loadMarketSource(
  prisma: PrismaInstance,
  fragranceIds: string[],
): Promise<MarketSourceSets> {
  const pointsById = new Map<string, PriceCapture[]>();
  if (fragranceIds.length > 0) {
    const rows = await prisma.pricePoint.findMany({
      where: { fragranceId: { in: fragranceIds } },
      orderBy: { capturedAt: "asc" },
    });
    for (const row of rows) {
      const list = pointsById.get(row.fragranceId) ?? [];
      list.push({
        fragranceId: row.fragranceId,
        source: row.source,
        priceCents: row.priceCents,
        capturedAt: row.capturedAt.toISOString(),
        sizeMl: row.sizeMl,
      });
      pointsById.set(row.fragranceId, list);
    }
  }
  return { pointsFor: (fragranceId) => pointsById.get(fragranceId) ?? [] };
}

export async function computeShelfWorth(
  prisma: PrismaInstance,
  userId: string,
  now: Date,
): Promise<ShelfSummary> {
  const rows = await listCollection(prisma, userId);
  const itemsByFragrance = new Map<string, ShelfFragranceInput["items"]>();
  for (const row of rows) {
    const items = itemsByFragrance.get(row.fragranceId) ?? [];
    items.push({
      itemId: row.id,
      sizeMl: row.sizeMl,
      pricePaidCents: row.pricePaidCents,
    });
    itemsByFragrance.set(row.fragranceId, items);
  }

  const source = await loadMarketSource(prisma, [...itemsByFragrance.keys()]);
  const entries: ShelfFragranceInput[] = [...itemsByFragrance].map(
    ([fragranceId, items]) => ({
      items,
      groups: estimateFromSource(source, fragranceId, { now }),
    }),
  );
  return shelfWorth(entries);
}
