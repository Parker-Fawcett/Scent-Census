// Shopping search links for a bottle we have no captured price for.
//
// The census has live asking prices for a little over a thousand bottles; the
// catalogue holds 140,000. The old "Where to buy" block simply vanished when
// no price was captured, which left most product pages with no shopping path
// at all. These are plain searches, not sponsored placements and not prices:
// they send the reader to a discounter's own search results, where the
// retailer's live price and size are the retailer's to show.
//
// When a partner is signed and a price is captured, loadBuyOptions takes
// over and this fallback is not rendered.

export interface ShopSearchLink {
  name: string;
  url: string;
  note: string;
}

export function buildShopSearchLinks(name: string, house: string): ShopSearchLink[] {
  const query = encodeURIComponent(`${name} ${house}`.trim());
  return [
    {
      name: "FragranceNet",
      url: `https://www.fragrancenet.com/search?q=${query}`,
      note: "discounter",
    },
    {
      name: "Perfumania",
      url: `https://perfumania.com/search?q=${query}`,
      note: "discounter",
    },
    {
      name: "MicroPerfumes",
      url: `https://www.microperfumes.com/search?q=${query}`,
      note: "bottles and decants",
    },
  ];
}
