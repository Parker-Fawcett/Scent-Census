// M5 curation loader: the only code allowed to move Fragrance.inspiredById.
// Input is the approved-by-hand file (clone fid -> target fid with a note);
// resolution runs through catalogueSourcePid (fragrantica-<fid>), the stable
// join key, so display name punctuation can never collide. The loader is
// idempotent: same edges again are no-ops. It refuses to overwrite an
// existing edge silently; replacing requires the explicit replace flag, and
// unresolvable fids come back loud instead of vanishing.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaInstance } from "@/lib/prisma";
import { loadApprovedCloneEdges } from "@/server/curation";

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

async function seedCorpus(pid: string, name: string): Promise<{ id: string }> {
  const house = await prisma.house.upsert({
    where: { slug: "curation-test-house" },
    create: { name: "Curation Test House", slug: "curation-test-house", tier: "DESIGNER" },
    update: {},
  });
  return prisma.fragrance.upsert({
    where: { slug: `${pid}-${RUN}` },
    create: { name, slug: `${pid}-${RUN}`, houseId: house.id, year: 2021, accords: [] },
    update: {},
  });
}

describe("loadApprovedCloneEdges", () => {
  it("links an approved pair through the corpus pid and is idempotent on rerun", async () => {
    const clone = await seedCorpus("cur-clone", "Curated Clone One");
    const target = await seedCorpus("cur-target", "Curated Target One");
    // the corpus ingest stores catalogueSourcePid like "fragrantica-<fid>"
    await prisma.fragrance.update({ where: { id: clone.id }, data: { catalogueSourcePid: `fragrantica-9811${RUN}` } });
    await prisma.fragrance.update({ where: { id: target.id }, data: { catalogueSourcePid: `fragrantica-9007${RUN}` } });

    const summary = await loadApprovedCloneEdges(prisma, [
      { cloneFid: `9811${RUN}`, targetFid: `9007${RUN}`, note: "hand-checked" },
    ]);
    expect(summary.applied).toBe(1);

    const row = await prisma.fragrance.findUniqueOrThrow({ where: { id: clone.id } });
    expect(row.inspiredById).toBe(target.id);

    const again = await loadApprovedCloneEdges(prisma, [
      { cloneFid: `9811${RUN}`, targetFid: `9007${RUN}`, note: "hand-checked" },
    ]);
    expect(again.applied).toBe(0);
    expect(again.alreadyLinked).toBe(1);
    const row2 = await prisma.fragrance.findUniqueOrThrow({ where: { id: clone.id } });
    expect(row2.inspiredById).toBe(target.id);
  });

  it("refuses to silently overwrite an existing edge; replace requires the flag", async () => {
    const clone = await seedCorpus("cur-clone2", "Curated Clone Two");
    const first = await seedCorpus("cur-t2", "Curated Target Two");
    const other = await seedCorpus("cur-t3", "Curated Target Three");
    await prisma.fragrance.update({ where: { id: clone.id }, data: { catalogueSourcePid: `fragrantica-a${RUN}` } });
    await prisma.fragrance.update({ where: { id: first.id }, data: { catalogueSourcePid: `fragrantica-b${RUN}` } });
    await prisma.fragrance.update({ where: { id: other.id }, data: { catalogueSourcePid: `fragrantica-c${RUN}` } });
    await prisma.fragrance.update({ where: { id: clone.id }, data: { inspiredById: first.id } });

    const summary = await loadApprovedCloneEdges(prisma, [
      { cloneFid: `a${RUN}`, targetFid: `c${RUN}` },
    ]);
    expect(summary.refused).toHaveLength(1);
    expect(summary.refused[0].reason).toMatch(/already/i);
    const unchanged = await prisma.fragrance.findUniqueOrThrow({ where: { id: clone.id } });
    expect(unchanged.inspiredById).toBe(first.id);

    const replaced = await loadApprovedCloneEdges(prisma, [
      { cloneFid: `a${RUN}`, targetFid: `c${RUN}`, replace: true },
    ]);
    expect(replaced.applied).toBe(1);
    const moved = await prisma.fragrance.findUniqueOrThrow({ where: { id: clone.id } });
    expect(moved.inspiredById).toBe(other.id);
  });

  it("an alternate pair is counted and resolved but never linked", async () => {
    const clone = await seedCorpus("cur-clone-alt", "Alternate Clone");
    const target = await seedCorpus("cur-t-alt", "Alternate Target");
    await prisma.fragrance.update({ where: { id: clone.id }, data: { catalogueSourcePid: `fragrantica-alt${RUN}` } });
    await prisma.fragrance.update({ where: { id: target.id }, data: { catalogueSourcePid: `fragrantica-alt2${RUN}` } });

    const summary = await loadApprovedCloneEdges(prisma, [
      { cloneFid: `alt${RUN}`, targetFid: `alt2${RUN}`, alternate: true },
    ]);
    expect(summary.alternates).toBe(1);
    expect(summary.applied).toBe(0);
    const row = await prisma.fragrance.findUniqueOrThrow({ where: { id: clone.id } });
    expect(row.inspiredById).toBeNull();
  });

  it("an unresolvable fid fails loud with the offending pair, and self-pairs are refused", async () => {
    await expect(
      loadApprovedCloneEdges(prisma, [{ cloneFid: `zzz1${RUN}`, targetFid: `zzz2${RUN}` }]),
    ).rejects.toThrow(/unresolved/i);
    await expect(
      loadApprovedCloneEdges(prisma, [{ cloneFid: `same${RUN}`, targetFid: `same${RUN}` }]),
    ).rejects.toThrow(/itself/i);
  });
});
