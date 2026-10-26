// "Where to buy": the one place on a product page where money appears.
//
// The rules, from docs/IDENTITY.md:
//
//   1. The census ranking is never affected by a partner. This block sits
//      BELOW the ranked census list, it is labeled, and nothing in the
//      ranking code reads a partner or a commission.
//   2. The price shown next to a link is the price we captured from that
//      partner's own feed. It is not a price we negotiated, and a partner
//      cannot change what it says about a fragrance.
//   3. Outbound links are marked sponsored, so a reader (and a search
//      engine) can tell a paid link from an editorial one.
//
// The block is a service, not a pay-to-play listing: a reader sees where the
// bottle is cheapest, and the partner gets the click. The commission affects
// our revenue and never our ordering.

import { prisma } from "@/lib/prisma";
import { buildPartnerUrl, clickToken, type PartnerRow } from "@/domain/affiliate";
import { readPrice } from "@/domain/retailPrice";

export interface BuyOption {
  partnerName: string;
  priceCents: number;
  sizeMl: number | null;
  url: string;
  /** the retailer's own product path, so the link lands on the right bottle */
  productPath: string | null;
  /**
   * whether this link earns us anything. It is only true when the partner
   * has an affiliate identifier on file, which is the only thing that
   * turns a plain deep link into a paid link. The disclosure on the page
   * reads this, so the page never claims a commission we do not have.
   */
  earns: boolean;
  /** when the price was captured, so the page can say how fresh it is */
  capturedAt: Date;
}

/**
 * The buy options for one fragrance, cheapest first.
 *
 * Cheapest first is the only ordering that is safe: if we ever let
 * commission affect the order, a retailer could buy a better position, and
 * the page would stop being a measurement.
 */
export async function loadBuyOptions(fragranceId: string, limit = 4): Promise<BuyOption[]> {
  const partners = await prisma.partner.findMany({ where: { active: true } });
  if (partners.length === 0) return [];

  const points = await prisma.pricePoint.findMany({
    where: { fragranceId, partnerId: { in: partners.map((p) => p.id) } },
    orderBy: { capturedAt: "desc" },
  });
  if (points.length === 0) return [];

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const byPartner = new Map<string, typeof points[number]>();
  for (const point of points) {
    if (point.partnerId === null) continue;
    const existing = byPartner.get(point.partnerId);
    // keep the freshest capture per partner
    if (existing === undefined || point.capturedAt > existing.capturedAt) {
      byPartner.set(point.partnerId, point);
    }
  }

  const options: BuyOption[] = [];
  for (const [partnerId, point] of byPartner) {
    const partner = partnerById.get(partnerId);
    if (partner === undefined) continue;
    const read = readPrice([{ priceCents: point.priceCents, sizeMl: point.sizeMl, capturedAt: point.capturedAt }]);
    if (read === null) continue;
    const productPath = productPathFrom(point.sourceListingId, partner.slug);
    const token = clickToken(partner.slug, fragranceId, "buy");
    options.push({
      partnerName: partner.name,
      priceCents: read.cheapestCents ?? read.lowCents,
      sizeMl: read.displaySizeMl,
      url: buildPartnerUrl(partner, productPath, token),
      productPath,
      // a link only earns money when the partner has an affiliate id on
      // file. Every partner is null on that today, so the disclosure on
      // the page must not claim a commission we do not have.
      earns: partner.affiliateId !== null && partner.affiliateId !== "",
      capturedAt: point.capturedAt,
    });
  }

  options.sort((a, b) => a.priceCents - b.priceCents);
  return options.slice(0, limit);
}

/**
 * Recover the retailer's product path from the capture's listing id.
 * The capture stores "<partner>:<handle>:<variant>", and the retailer's
 * product page is /products/<handle>.
 */
export function productPathFrom(sourceListingId: string | null, partnerSlug: string): string | null {
  if (sourceListingId === null) return null;
  const parts = sourceListingId.split(":");
  if (parts.length < 2) return null;
  const handle = parts[1];
  if (handle === "") return null;
  if (partnerSlug === "perfumania" || partnerSlug === "microperfumes" || partnerSlug === "armaf" || partnerSlug === "afnan" || partnerSlug === "lattafa" || partnerSlug === "alwataniah") {
    return `/products/${handle}`;
  }
  return `/products/${handle}`;
}
