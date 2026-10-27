import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * The clone families, for the explore page.
 *
 * The explore page is a client component so the page number can be read from
 * the URL without a server params promise, and that promise could not cross a
 * Suspense boundary without leaving the boundary pending in the browser.
 * This route is where the data comes from instead.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const PAGE_SIZE = 40;

  // The family comes from the smell-alike EDGES, not from the canon
  // relation. The canon table is the 34 hand-curated pairs; the edge table is
  // the whole measured graph, so a family here is every clone the community
  // has voted on, which is 8,500 originals rather than 16.
  const originals = await prisma.fragrance.findMany({
    where: { inspiredEdgesAsTarget: { some: {} } },
    orderBy: [{ popularityMagnitude: "desc" }, { name: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      slug: true,
      year: true,
      house: { select: { name: true, slug: true } },
      inspiredEdgesAsTarget: {
        select: {
          clone: { select: { name: true, slug: true } },
          upVotes: true,
          downVotes: true,
        },
      },
    },
  });

  const total = await prisma.fragrance.count({ where: { inspiredEdgesAsTarget: { some: {} } } });

  return NextResponse.json({
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    families: originals.map((o) => {
      const withVotes = o.inspiredEdgesAsTarget
        .map((e) => {
          const tot = e.upVotes + e.downVotes;
          return {
            name: e.clone.name,
            slug: e.clone.slug,
            score: tot > 0 ? Math.round((e.upVotes / tot) * 100) : null,
            votes: tot,
          };
        })
        .sort((a, b) => b.votes - a.votes);
      return {
        name: o.name,
        slug: o.slug,
        year: o.year,
        house: o.house,
        cloneCount: o.inspiredEdgesAsTarget.length,
        closest: withVotes[0] ?? null,
      };
    }),
  });
}
