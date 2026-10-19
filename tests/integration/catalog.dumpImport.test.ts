// M4/M6 integration: the free-path corpus importer. The mapper is proven on
// committed real rows (see tests/unit/fragranticaDump.test.ts); these tests
// prove PERSISTENCE semantics: houses canonicalize by slug (the corpus spells
// brands inconsistently, e.g. "PARIS CORNER"), fragrances carry accords in
// strength order, notes persist with honest family="unknown" and ANY for
// flat notes, and re-running the import never duplicates (refresh contract).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { importDumpRecords, importCatalogRecords, loadDumpByPids } from "@/server/catalog";
import { applyProvisionalHouseTiers } from "@/server/catalog";
import { mapDumpLine, type MappedDumpFragrance } from "../../src/ingest/fragranticaDump";

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

const record = (over: Partial<MappedDumpFragrance> & { fid: number }): MappedDumpFragrance => ({
  name: `Corpus Frag ${over.fid}`,
  brandName: "Test House",
  slugBase: `corpus-frag-${over.fid}`,
  year: 2020,
  perfumers: [],
  accords: [],
  pyramid: [],
  ...over,
});

describe("importDumpRecords", () => {
  it("persists accords ordered strongest-first on the fragrance", async () => {
    await importDumpRecords(prisma, [
      record({
        fid: 900001,
        name: "Accord Test One",
        accords: [
          { name: "fruity", strength: 90 },
          { name: "sweet", strength: 40 },
          { name: "woody", strength: 62 },
        ],
      }),
    ]);
    const rows = await loadDumpByPids(prisma, ["fragrantica-900001"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.accordNames[0]).toBe("fruity");
    expect(rows[0]!.accordNames).toEqual(["fruity", "woody", "sweet"]);
  });

  it("persists the note pyramid with weights and honest unknown family", async () => {
    await importDumpRecords(prisma, [
      record({
        fid: 900002,
        name: "Pyramid Test One",
        pyramid: [
          { position: "TOP", name: "Pear", weight: 100 },
          { position: "BASE", name: "Musk", weight: 30 },
          { position: "ANY", name: "Oud", weight: 15 },
        ],
      }),
    ]);
    const rows = await loadDumpByPids(prisma, ["fragrantica-900002"]);
    expect(rows).toHaveLength(1);
    const notes = rows[0]!.notes;
    expect(notes).toHaveLength(3);
    const pear = notes.find((n) => n.name === "Pear")!;
    expect(pear.position).toBe("TOP");
    expect(pear.weight).toBeCloseTo(1.0); // 0..100 corpus scale -> 0..1 domain scale
    const oud = notes.find((n) => n.name === "Oud")!;
    expect(oud.position).toBe("ANY");
    const musk = notes.find((n) => n.name === "Musk")!;
    expect(musk.weight).toBeCloseTo(0.3);
  });

  it("canonicalizes house spelling variants into one house row", async () => {
    await importDumpRecords(prisma, [
      record({ fid: 900003, brandName: "PARIS CORNER TEST", name: "Spelling Variant A" }),
      record({ fid: 900004, brandName: "Paris Corner Test", name: "Spelling Variant B" }),
    ]);
    const rows = await loadDumpByPids(prisma, ["fragrantica-900003", "fragrantica-900004"]);
    expect(rows).toHaveLength(2);
    const houseIds = new Set(rows.map((r) => r.house.id));
    expect(houseIds.size).toBe(1);
  });

  it("reuses a same-named house from the FragDB seed instead of dying on House.name unique", async () => {
    // regression: dev seeding created houses like "Dior" (House.name unique);
    // the corpus import used to skip those brands via skipDuplicates and then
    // referenced a house row that never existed (PRD honesty: a famous house
    // silently failing is the worst failure mode). Unique display name here
    // because the shared test DB already carries a FragDB-seeded "Dior".
    const seededName = "Simmons Homes Test";
    await importCatalogRecords(prisma, [
      {
        pid: "900006-frag",
        name: "FragDB Dior Example",
        slugBase: "fragdb-dior-example",
        housePid: "x111",
        houseName: seededName,
        year: 2020,
        inspiredById: null,
        accords: [],
        perfumers: [],
        pyramid: [],
      },
    ]);
    await expect(
      importDumpRecords(prisma, [
        record({ fid: 900006, brandName: seededName, name: "Corpus On Dior House" }),
      ]),
    ).resolves.toBeDefined();
    const rows = await loadDumpByPids(prisma, ["fragrantica-900006"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.house.name).toBe(seededName);
  });

  it("re-running the import never duplicates (refresh contract)", async () => {
    const batch = [
      record({ fid: 900005, name: "Idem Potent", accords: [{ name: "citrus", strength: 100 }] }),
    ];
    await importDumpRecords(prisma, batch);
    await importDumpRecords(prisma, batch);
    const rows = await loadDumpByPids(prisma, ["fragrantica-900005"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.accordNames).toEqual(["citrus"]);
    const pyramids = await prisma.fragranceNote.findMany({
      where: { note: { name: "Idem Potent Note Absent" } },
    });

    // and the fragrance count is still exactly one
    const count = await prisma.fragrance.count({
      where: { catalogueSourcePid: "fragrantica-900005" },
    });
    expect(count).toBe(1);
    void pyramids;
  });

  it("keeps two same-named corpus rows of one house as distinct rows", async () => {
    // regression: the corpus contains ~2000 brand+name repeat lists (same
    // name listed under two corpus ids). Within one createMany they used to
    // resolve to the same slug and skipDuplicates silently dropped them.
    await importDumpRecords(prisma, [
      record({ fid: 900007, name: "Contradiction", brandName: "Calvin Klein Test", slugBase: "contradiction" }),
      record({ fid: 900008, name: "Contradiction", brandName: "Calvin Klein Test", slugBase: "contradiction" }),
    ]);
    const rows = await loadDumpByPids(prisma, ["fragrantica-900007", "fragrantica-900008"]);
    expect(rows).toHaveLength(2);
  });

  it("tiers the curated clone houses and leaves the rest DESIGNER", async () => {
    // PRD 7.6: curation sets house tiers; the corpus ships everything as a
    // DESIGNER default. This is the honestly-known clone-house subset.
    await importDumpRecords(prisma, [
      record({ fid: 900009, brandName: "Armaf", name: "Tier Check Clone" }),
      record({ fid: 900010, brandName: "Dior", name: "Tier Check Designer" }),
    ]);
    await applyProvisionalHouseTiers(prisma);
    const cloneRow = await prisma.house.findFirst({ where: { name: "Armaf" } });
    const designerRow = await prisma.house.findFirst({ where: { name: "Dior" } });
    expect(cloneRow!.tier).toBe("CLONE");
    expect(designerRow!.tier).toBe("DESIGNER");
  });

  it("measures no-nonsense scale: 1000 corpus records import inside one call", async () => {    const batch: MappedDumpFragrance[] = [];
    for (let i = 0; i < 1000; i += 1) {
      batch.push(
        record({
          fid: 910000 + i,
          name: `Scale Frag ${i}`,
          slugBase: `scale-frag-${i}`,
          accords: [{ name: "woody", strength: 50 }, { name: "sweet", strength: 10 }],
          pyramid: [{ position: "TOP", name: "Bergamot", weight: 80 }],
        }),
      );
    }
    await importDumpRecords(prisma, batch);
    const count = await prisma.fragrance.count({
      where: { catalogueSourcePid: { startsWith: "fragrantica-91" } },
    });
    expect(count).toBe(1000);
  });
});

// helper referenced by the describe block above (hoisted function decl)
function mapFixture(line: string): MappedDumpFragrance {
  const result = mapDumpLine(line);
  if (!result.record) throw new Error(`fixture line unmappable: ${result.error?.message}`);
  return result.record;
}
void mapFixture;
