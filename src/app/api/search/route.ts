import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchCatalogue } from "@/server/catalogueSearch";

/**
 * Catalogue search, as JSON.
 *
 * The search page renders its results on the server now, so this route
 * exists for the places that need the data as data rather than as a page:
 * the add-a-bottle form, and anything that wants to search without a
 * navigation.
 *
 * A route handler rather than a server component because the query string
 * has to come from the URL, and the server's params promise could not cross
 * a Suspense boundary without leaving the boundary pending in the browser:
 * the server streamed the content correctly, but React never swapped the
 * fallback out, so the page read "Searching..." forever.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q === "") {
    return NextResponse.json({ query: "", hits: [] });
  }

  const limit = Number(url.searchParams.get("limit") ?? "20") || 20;
  const hits = await searchCatalogue(prisma, q, { limit: Math.min(limit, 60) });

  return NextResponse.json({
    query: q,
    hits: hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      slug: hit.slug,
      house: hit.house,
      houseSlug: hit.houseSlug,
      year: hit.year,
      pid: hit.pid,
      cloneCount: hit.cloneCount,
      matchKind: hit.matchKind,
    })),
  });
}
