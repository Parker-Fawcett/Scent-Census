// Loading and rendering an ad slot.
//
// The exclusion rule from src/domain/ads.ts is enforced HERE, at the point
// where a slot is chosen for a page. The rule is about the RELATIONSHIP
// between the ad and the ranked content:
//
//   - a house CAN advertise its own fragrance on that fragrance's page
//     (ordinary retail, and the inventory a house actually wants);
//   - a house CANNOT advertise a fragrance that the page's own census
//     ranking lists, because a reader would read the ranking as an
//     endorsement of the ad;
//   - a generic company ad is allowed anywhere.
//
// The ranking itself is untouched: nothing here can change an order, a
// score, or a vote count.

import { prisma } from "@/lib/prisma";
import { isSlotEligible, isSlotLive, type AdSlot, type PageContext } from "@/domain/ads";

export interface RenderableSlot {
  id: string;
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  sponsorName: string | null;
}

export async function loadAdSlot(
  placement: string,
  page: PageContext,
): Promise<RenderableSlot | null> {
  const now = new Date();
  const slots = await prisma.adSlot.findMany({
    where: { placement, startsAt: { lte: now } },
    orderBy: { startsAt: "desc" },
    include: {
      sponsorHouse: { select: { name: true } },
      sponsorPartner: { select: { name: true, active: true, paysForAds: true } },
    },
  });

  // THE RULE: an ad renders only when a partner is actually paying for it.
  //
  // The slots that used to be in this database were seeded fakes, so the
  // pages were serving "Advertisement, Lattafa Perfumes" to readers as
  // though a house had bought the placement. Nobody had. A slot with no
  // paying partner is not an ad, it is a lie with a logo on it, so it does
  // not render at all.
  const paying = slots.filter(
    (slot) =>
      slot.sponsorPartner !== null &&
      slot.sponsorPartner.active &&
      slot.sponsorPartner.paysForAds,
  );
  if (paying.length === 0) return null;

  // Priority, so the most relevant ad wins rather than the newest one:
  //   1. an ad for the page's own subject scent, which is what a house
  //      buying that page actually wants;
  //   2. an ad that names no scent, which cannot be confused with the
  //      ranking;
  //   3. any other eligible ad.
  //
  // Eligibility is checked for every candidate before it is ranked, so a
  // suppressed ad never takes a slot it was excluded from.
  const eligible = paying.filter((slot) => {
    if (slot.endsAt !== null && slot.endsAt < now) return false;
    if (!isSlotLive(slot, now)) return false;
    return isSlotEligible(slot, page);
  });
  if (eligible.length === 0) return null;

  const rank = (slot: (typeof eligible)[number]): number => {
    if (slot.fragranceId === page.subjectFragranceId) return 0;
    if (slot.fragranceId === null) return 1;
    return 2;
  };
  eligible.sort((a, b) => rank(a) - rank(b) || b.startsAt.getTime() - a.startsAt.getTime());

  const slot = eligible[0];
  await prisma.adSlot.update({
    where: { id: slot.id },
    data: { impressions: { increment: 1 } },
  }).catch(() => undefined);
  return {
    id: slot.id,
    headline: slot.headline,
    body: slot.body,
    ctaText: slot.ctaText,
    ctaUrl: slot.ctaUrl,
    sponsorName: slot.sponsorPartner?.name ?? slot.sponsorHouse?.name ?? null,
  };
}
