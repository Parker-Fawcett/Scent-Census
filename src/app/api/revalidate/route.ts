// Page revalidation, on demand.
//
// WHY THIS EXISTS
//
// The pages that depend on runtime data (a search query, a clone family, a
// price) are streamed: the server sends the shell first and the content
// right after. That means the CDN must not serve a cached copy of the shell
// on its own, because the flight payload in that cached copy references
// chunk ids from the build that made it. A stale cached shell plus a fresh
// chunk manifest is a page that streams its content and never renders it:
// the reader sees "Loading..." forever while the server response looks
// perfect.
//
// The fix is to tell Vercel the cached copy is stale whenever the content
// changes. A deploy does not do that automatically, so this endpoint is
// called after a deploy and on a schedule.
//
//   curl -X POST https://scentcensus.com/api/revalidate
//     -H "authorization: Bearer $CRON_SECRET"

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/config";
import { prisma } from "@/lib/prisma";

function authorized(request: Request): boolean {
  if (env.cronSecret === null) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.cronSecret}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const staticPaths = ["/", "/explore", "/search", "/signin", "/creator/claim"];
  for (const path of staticPaths) revalidatePath(path);

  // the fragrance pages that carry a clone census, and the house pages that
  // link to them
  const fragrances = await prisma.fragrance.findMany({
    where: { inspiredEdgesAsTarget: { some: {} } },
    select: { slug: true },
    take: 900,
  });
  for (const f of fragrances) revalidatePath(`/fragrance/${f.slug}`);

  const houses = await prisma.house.findMany({
    where: { fragrances: { some: { inspiredEdgesAsTarget: { some: {} } } } },
    select: { slug: true },
    take: 300,
  });
  for (const h of houses) revalidatePath(`/house/${h.slug}`);

  const count = await prisma.fragrance.count({ where: { inspiredEdgesAsTarget: { some: {} } } });
  return NextResponse.json({
    staticPaths: staticPaths.length,
    fragrances: fragrances.length,
    houses: houses.length,
    fragrancesWithFamilies: count,
  });
}
