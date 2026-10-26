// Outbound click tracking.
//
// A click on a partner link goes through here so the traffic is countable.
// The handler is a redirect: it records the click, then sends the visitor to
// the retailer.
//
// The click token is carried in the URL the visitor arrives with, so no
// lookup is needed to know which partner and which fragrance the click was
// for. The click count is written to the link row, which is also what makes
// a revenue report possible later without a new event pipeline.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const { token } = await params;
  const url = new URL(request.url);
  const slug = url.searchParams.get("p") ?? "";
  const fragrance = url.searchParams.get("f") ?? "";
  const placement = url.searchParams.get("pl") ?? "row";

  let destination = url.searchParams.get("to");
  if (destination === null) {
    return NextResponse.json({ error: "missing destination" }, { status: 400 });
  }
  // only allow redirects we know are ours, so this cannot be used as an open
  // redirect for someone else's link
  try {
    const parsed = new URL(destination);
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "bad destination" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "bad destination" }, { status: 400 });
  }

  if (slug !== "" && fragrance !== "") {
    const link = await prisma.partnerLink.findFirst({
      where: { partner: { slug }, fragrance: { slug: fragrance }, placement },
      select: { id: true },
    });
    if (link !== null) {
      await prisma.partnerLink.update({
        where: { id: link.id },
        data: { clicks: { increment: 1 } },
      });
    }
  }

  return NextResponse.redirect(destination);
}
