// Ad slots.
//
// The rule that matters: the census RANKING is never for sale. A house can
// advertise, and it can advertise its own fragrances, because that is the
// natural ad product for this site. What it cannot do is buy presence
// inside a ranking, or appear on a page in a way that makes the ranking
// look like an endorsement of the ad.
//
// So the rule is about the RELATIONSHIP between the ad and the ranked
// content, not about house identity:
//
//   1. An ad never appears inside a ranked list. Placement decides that,
//      and placement is by page type, never by rank position.
//
//   2. An ad is always labeled "Advertisement" with the advertiser named.
//
//   3. An ad for a fragrance is suppressed on a page where that fragrance
//      appears in the page's own census ranking, UNLESS it is the page's
//      subject. Reading the two next to each other, a reader would take the
//      ranking as an endorsement of the ad. The subject is the exception
//      because a brand advertising its own product on its own product page
//      is ordinary retail, not pay-to-play.
//
//   4. A generic company ad, which promotes no fragrance and is not a
//      fragrance house, is allowed anywhere. It cannot be mistaken for a
//      census result because it names no scent.
//
//   5. The ranking code reads no partner, no commission, and no ad slot.
//      That is the structural guarantee: no amount of money changes an
//      order, because the order does not know money exists.
//
// Rules 1, 3 and 4 live in code rather than in a policy document, because a
// rule in a document is a rule someone breaks under revenue pressure.

export type AdSlotPlacement = "page-bottom" | "below-fold" | "creator-page";

export interface AdSlot {
  id: string;
  placement: string;
  headline: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  /** the fragrance this ad promotes, if it promotes one */
  fragranceId: string | null;
  /** who is paying: a fragrance house for house ads, null for a company ad */
  sponsorHouseId: string | null;
  sponsorHouseName: string | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface PageContext {
  /** the fragrance the page is about */
  subjectFragranceId: string;
  /** every fragrance that appears in the page's ranked census list */
  rankedFragranceIds: string[];
}

/**
 * The exclusion rule.
 *
 * See rule 3 above. A slot that promotes a fragrance which the page ranks
 * is suppressed, unless that fragrance is the page's subject.
 */
export function isSlotEligible(
  slot: Pick<AdSlot, "fragranceId">,
  page: PageContext,
): boolean {
  // a generic ad promotes no fragrance, so it cannot be mistaken for a
  // census result
  if (slot.fragranceId === null) return true;
  // the page's own subject: a brand advertising its own product here is
  // ordinary retail
  if (slot.fragranceId === page.subjectFragranceId) return true;
  // anything else: suppressed if the page ranks that scent
  return !page.rankedFragranceIds.includes(slot.fragranceId);
}

/** A slot is live when it is inside its date window. */
export function isSlotLive(slot: Pick<AdSlot, "startsAt" | "endsAt">, now: Date): boolean {
  if (slot.startsAt > now) return false;
  if (slot.endsAt !== null && slot.endsAt < now) return false;
  return true;
}
