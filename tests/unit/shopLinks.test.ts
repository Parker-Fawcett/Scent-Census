// The shopping fallback: plain searches, no prices and no sponsorship.

import { describe, expect, it } from "vitest";
import { buildShopSearchLinks } from "@/domain/shopLinks";

describe("buildShopSearchLinks", () => {
  it("builds one search per retailer", () => {
    const links = buildShopSearchLinks("Marwa", "Arabiyat Prestige");
    expect(links.map((link) => link.name)).toEqual([
      "FragranceNet",
      "Perfumania",
      "MicroPerfumes",
    ]);
  });

  it("encodes the name and house into the query", () => {
    const links = buildShopSearchLinks("Love Don't Be Shy", "Kilian");
    for (const link of links) {
      expect(link.url).toContain("Love%20Don't%20Be%20Shy%20Kilian");
    }
  });

  it("uses https only", () => {
    for (const link of buildShopSearchLinks("Marwa", "Arabiyat Prestige")) {
      expect(link.url.startsWith("https://")).toBe(true);
    }
  });
});
