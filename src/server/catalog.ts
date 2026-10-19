// Catalogue over Postgres: import mapped FragDB records (the mapper stays
// structure-only; FKs prove existence) and search using the M1 domain
// ranking, so the seed lands once and stays unique. Idempotency by pid is
// the release-diff contract: re-running an ingest never duplicates, and the
// follow stream can trust catalogueSourcePid as the join key.

import { searchCatalog, type CatalogHit } from "@/domain/catalogSearch";
import type { MappedCatalogFragrance } from "@/ingest/fragdb";
import type { PrismaInstance } from "@/lib/prisma";

export async function importCatalogRecords(
  prisma: PrismaInstance,
  records: MappedCatalogFragrance[],
): Promise<void> {
  for (const record of records) {
    const house = await prisma.house.upsert({
      where: { slug: houseSlug(record.housePid) },
      create: {
        name: record.houseName,
        slug: houseSlug(record.housePid),
        tier: "DESIGNER", // provisional; curation sets tiers (PRD 7.6)
        catalogueSourcePid: record.housePid,
      },
      update: { name: record.houseName, catalogueSourcePid: record.housePid },
    });

    // slug collision (two fragrances, same name): the pid disambiguates,
    // which is what a refresh looks like after a rebrand anyway
    const slugOwner = await prisma.fragrance.findUnique({
      where: { slug: record.slugBase },
      select: { catalogueSourcePid: true },
    });
    const slug =
      slugOwner === null || slugOwner.catalogueSourcePid === record.pid
        ? record.slugBase
        : `${record.slugBase}-${record.pid}`;

    await prisma.fragrance.upsert({
      where: { catalogueSourcePid: record.pid },
      create: {
        name: record.name,
        slug,
        houseId: house.id,
        year: record.year,
        catalogueSourcePid: record.pid,
      },
      update: { name: record.name, year: record.year },
    });
  }
}

function houseSlug(housePid: string): string {
  return `house-${housePid}`;
}

export async function searchCatalogInDb(
  prisma: PrismaInstance,
  query: string,
): Promise<CatalogHit[]> {
  const rows = await prisma.fragrance.findMany({
    include: { house: true },
  });
  const catalogRecords = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    house: { id: row.house.id, name: row.house.name, slug: row.house.slug, tier: row.house.tier },
    year: row.year,
    inspiredById: row.inspiredById,
    noteNames: [],
    accordNames: [],
  }));
  return searchCatalog(catalogRecords, query);
}
