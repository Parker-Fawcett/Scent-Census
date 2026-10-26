// Affiliate links.
//
// The rule from docs/IDENTITY.md: money never touches the ranking. A partner
// pays for a click, not for a position. The census order comes from votes and
// from the measured closeness, and nothing in this file can change it.
//
// What a partner gets: a click on a link that sits next to a product they
// sell, on a page where the visitor has already decided what they want. That
// is the highest-intent traffic a retailer can buy, which is why the same
// relationship can carry a price feed in the other direction.

import type { Partner } from "@prisma/client";

export interface PartnerRow {
  slug: string;
  name: string;
  network: string;
  affiliateId: string | null;
  baseUrl: string;
  active: boolean;
  commissionBps: number;
}

/**
 * Build a trackable outbound URL.
 *
 * The click id is what makes the traffic countable. It is a short, stable
 * token per (partner, fragrance, placement) so a click can be attributed
 * without a database write on the hot path.
 */
export function buildPartnerUrl(
  partner: Pick<PartnerRow, "slug" | "network" | "affiliateId" | "baseUrl">,
  productPath: string | null,
  clickId: string,
): string {
  const base = partner.baseUrl.replace(/\/$/, "");
  const path = productPath === null || productPath === "" ? "" : productPath.startsWith("/") ? productPath : `/${productPath}`;
  const url = new URL(`${base}${path}`);

  if (partner.affiliateId !== null && partner.affiliateId !== "") {
    switch (partner.network) {
      // Commission Junction / Sovrn style
      case "cj":
      case "sovrn":
        url.searchParams.set("irclickid", partner.affiliateId);
        url.searchParams.set("irgwc", "1");
        break;
      // Rakuten Advertising style
      case "rakuten":
        url.searchParams.set("rakuten_adid", partner.affiliateId);
        break;
      // Impact style
      case "impact":
        url.searchParams.set("irgwc", "1");
        url.searchParams.set("irclickid", partner.affiliateId);
        break;
      // direct: the partner takes a plain parameter
      default:
        url.searchParams.set("ref", partner.affiliateId);
        break;
    }
  }

  // our own click token, always present so a click is attributable even
  // before the partner is joined to a network
  url.searchParams.set("sc_source", "scentcensus");
  url.searchParams.set("sc_click", clickId);
  return url.toString();
}

/**
 * The click token. Short and deterministic so the same link is the same link
 * on every render, which keeps it cacheable and lets a click counter live on
 * a row rather than in a log we have to ship.
 */
export function clickToken(partnerSlug: string, fragranceSlug: string, placement: string): string {
  const raw = `${partnerSlug}:${fragranceSlug}:${placement}`;
  // FNV-1a, enough for a token that only has to be unique
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
