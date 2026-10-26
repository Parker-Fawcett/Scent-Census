// M3 integration: the catalogue lives in Postgres now. The mapper (tested
// against committed FragDB samples, structure-only) feeds import; the search
// endpoint reuses the M1 domain ranking over DB rows. Idempotency by pid is
// the release-diff contract: re-running an ingest never duplicates.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { importCatalogRecords } from "@/server/catalog";
import { searchCatalogue } from "@/server/catalogueSearch";
import { mapFragDBCatalog } from "../../src/ingest/fragdb";
import type { MappedCatalogFragrance } from "../../src/ingest/fragdb";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const mapped = (over: Partial<MappedCatalogFragrance> & { pid: string }): MappedCatalogFragrance => ({
  name: `Frag ${over.pid}`,
  slugBase: `frag-${over.pid}`,
  housePid: "b7",
  houseName: "Guerlain",
  year: 2020,
  inspiredById: null,
  accords: [],
  perfumers: [],
  pyramid: [],
  ...over,
});

describe("importCatalogRecords", () => {
  it("creates houses and fragrances, keyed by pid, slugs unique on collision", async () => {
    const records = [
      mapped({ pid: "1000", name: "L'Homme Ideale", slugBase: "lhomme-ideale" }),
      mapped({ pid: "1001", name: "L'Homme Ideale Extreme", slugBase: "lhomme-ideale" }),
    ];
    await importCatalogRecords(prisma, records);
    const db = await loadByPids(["1000", "1001"]);
    expect(db).toHaveLength(2);
    expect(db.map((f) => f.catalogueSourcePid).sort()).toEqual(["1000", "1001"]);
    expect(new Set(db.map((f) => f.slug)).size).toBe(2);
  });

  it("is idempotent: re-importing the same pids creates no duplicates", async () => {
    const records = [mapped({ pid: "2000", name: "Saleel", slugBase: "saleel" })];
    await importCatalogRecords(prisma, records);
    const afterFirst = await countFor("2000");
    await importCatalogRecords(prisma, records);
    expect(afterFirst).toBe(1);
    expect(await countFor("2000")).toBe(afterFirst);
  });

  it("searches the real sample: the full mapper output lands and gets found", async () => {
    const samples = join(__dirname, "../fixtures/fragdb-samples");
    const catalog = mapFragDBCatalog({
      fragrancesCsv: readFileSync(join(samples, "fragrances.csv"), "utf8"),
      notesCsv: readFileSync(join(samples, "notes.csv"), "utf8"),
      accordsCsv: readFileSync(join(samples, "accords.csv"), "utf8"),
    });
    await importCatalogRecords(prisma, catalog.records);
    const hits = await searchCatalogue(prisma, "light blue");
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("Light Blue");
    expect(hits[0].house).toBe("Dolce&Gabbana");
  });

  it("caps results at the domain limit", async () => {
    const hits = await searchCatalogue(prisma, "frag", { limit: 20 });
    expect(hits.length).toBeLessThanOrEqual(20);
    expect(hits.length).toBeGreaterThan(0);
  });
});

async function loadByPids(pids: string[]): Promise<Array<{ catalogueSourcePid: string | null; slug: string }>> {
  return prisma.fragrance.findMany({
    where: { catalogueSourcePid: { in: pids } },
    select: { catalogueSourcePid: true, slug: true },
  });
}

async function countFor(pid: string): Promise<number> {
  return prisma.fragrance.count({ where: { catalogueSourcePid: pid } });
}
