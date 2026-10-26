// Outbound click tracking.
//
// A click on a partner link goes through here so the traffic is countable.
// The handler is a redirect: it records the click, then sends the visitor to
// the retailer.
//
// The destination is only ever a partner's own site. The `p` partner slug is
// required and the `to` url must sit on that partner's host, so this cannot
// be used as an open redirect to anyone else. The click count is written to
// the link row, which is also what makes a revenue report possible later
// without a new event pipeline.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clickToken } from "@/domain/affiliate";

interface Params {
  params: Promise<{ token: string }>;
}

function bad(): NextResponse {
  return NextResponse.json({ error: "bad destination" }, { status: 400 });
}

export async function GET(request: Request, { params }: Params): Promise<NextResponse> {
  const { token } = await params;
  const url = new URL(request.url);
  const slug = url.searchParams.get("p") ?? "";
  const fragrance = url.searchParams.get("f") ?? "";
  const placement = url.searchParams.get("pl") ?? "row";
  const destination = url.searchParams.get("to");
  if (destination === null || slug === "") return bad();

  let parsed: URL;
  try {
    parsed = new URL(destination);
  } catch {
    return bad();
  }
  if (parsed.protocol !== "https:") return bad();

  const partner = await prisma.partner.findUnique({
    where: { slug },
    select: { id: true, baseUrl: true, active: true },
  });
  if (partner === null || !partner.active) return bad();
  let partnerHost: string;
  try {
    partnerHost = new URL(partner.baseUrl).host;
  } catch {
    return bad();
  }
  if (parsed.host !== partnerHost) return bad();

  // only count a click whose token is the one we would have rendered, so a
  // hand-built url cannot inflate the counter for a link it does not match
  if (fragrance !== "" && token === clickToken(slug, fragrance, placement)) {
    await prisma.partnerLink.updateMany({
      where: { partnerId: partner.id, fragrance: { slug: fragrance }, placement },
      data: { clicks: { increment: 1 } },
    });
  }

  return NextResponse.redirect(parsed.toString());
}
