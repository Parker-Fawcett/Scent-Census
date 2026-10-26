import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/server/families";

const SITE_URL = "https://scentcensus.com";

// The indexable surface: home, every family page, and every fragrance the
// curation has tied to a clone pair.
//
// The family pages (an accord, a note) are how a reader gets from a
// fragrance to the other scents that share its profile, and they were the
// missing half of the index. A catalogue of 140,000 fragrances is only
// useful if a reader can walk into a family and see the best of it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The measured smell-alike graph, not the 34 hand-curated canon pairs.
  // 8,500 originals have clones the community voted on, and every one of
  // them deserves a page in the index.
  const targets = await prisma.fragrance.findMany({
    where: { inspiredEdgesAsTarget: { some: {} } },
    select: { slug: true, updatedAt: true },
  });
  const fragrances = await prisma.fragrance.findMany({
    where: { inspiredById: { not: null } },
    select: { slug: true, updatedAt: true },
  });
  const creators = await prisma.creator.findMany({
    select: { slug: true },
    take: 50,
  });
  // house pages: a second exit from every fragrance, and the only way to
  // browse a house's catalogue
  const houses = await prisma.house.findMany({
    where: { fragrances: { some: { inspiredById: { not: null } } } },
    select: { slug: true, updatedAt: true },
    take: 2000,
  });

  // the accord families. 92 of them, and every one is a real page.
  const accordRows = await prisma.$queryRawUnsafe<Array<{ a: string }>>(
    `SELECT DISTINCT unnest(accords) AS a FROM "Fragrance" WHERE cardinality(accords) > 0`,
  );
  const accords = accordRows
    .map((r) => r.a)
    .filter((a) => a !== "")
    .sort();

  // the note families, the ones with the most fragrances in them. There are
  // 2,592 notes and a page for each would be mostly empty, so the index
  // takes the top of them.
  const notes = await prisma.note.findMany({
    select: { name: true },
    orderBy: { fragranceNotes: { _count: "desc" } },
    take: 300,
  });

  const fragranceUrls = Array.from(
    new Map([...targets, ...fragrances].map((f) => [f.slug, f])).values(),
  );

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/search`, changeFrequency: "weekly", priority: 0.5 },
    ...houses.map((h) => ({
      url: `${SITE_URL}/house/${h.slug}`,
      lastModified: h.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...creators.map((c) => ({
      url: `${SITE_URL}/creator/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...accords.map((a) => ({
      url: `${SITE_URL}/accord/${slugify(a)}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...notes.map((n) => ({
      url: `${SITE_URL}/note/${slugify(n.name)}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...fragranceUrls.map((f) => ({
      url: `${SITE_URL}/fragrance/${f.slug}`,
      lastModified: f.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
