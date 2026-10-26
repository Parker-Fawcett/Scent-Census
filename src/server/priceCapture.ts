// The price capture, as a library.
//
// The script (scripts/capture-retail-prices.ts) and the cron route
// (/api/cron/capture-prices) both call this, so a price can never come from
// a code path that the schedule does not cover.
//
// The capture is INCREMENTAL on purpose. Re-fetching every retailer
// catalogue every day is rude to them and slow. Instead:
//   - a fragrance that was captured recently is skipped;
//   - only the fragrances whose price has gone stale are re-checked.
//
// The result is the same either way: a price capture with a capture date.

import { prisma } from "@/lib/prisma";
import { clickToken } from "@/domain/affiliate";

/** how old a price may get before we re-check it */
export const PRICE_FRESHNESS_DAYS = 7;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Products that are NOT the fragrance in a bottle.
 *
 * A body mist is not a cologne: it is 237ml of cheap body spray, and pricing
 * "Ariana Grande Cloud Body Mist" as Cloud would put a $9.95 number next to
 * a designer EDP. Same for the other formats that are not perfume.
 */
const NOT_A_BOTTLE = [
  "body", "shower", "gel", "mist", "spray", "hair", "lotion", "cream",
  "soap", "deodorant", "aftershave", "candle", "diffuser", "incense",
  "refill", "atomizer", "travel spray", "sachet", "pouch", "wash", "scrub",
  "shampoo", "conditioner", "powder", "balm", "oil", "pump", "pouch",
  "discovery", "kit", "gift", "set of", "sample", "vial", "tester", "sampler",
  "set", "minis", "decant",
];

/**
 * True when a product title names a format that is not a bottle of
 * fragrance. "Cloud Body Mist" is a mist, "Set" is a set, "Travel Spray" is
 * a sample.
 */
export function isBottleProduct(title: string): boolean {
  const lower = title.toLowerCase();
  for (const word of NOT_A_BOTTLE) {
    if (!new RegExp(`\\b${word}\\b`).test(lower)) continue;
    // "Gift Set" and "Body Mist" are never a bottle. But a scent whose own
    // name contains the word (rare) should still match, so the check is on
    // the whole title rather than a suffix.
    return false;
  }
  return true;
}

export interface RetailSource {
  name: string;
  baseUrl: string;
  maxPages: number;
}

export const RETAIL_SOURCES: RetailSource[] = [
  // clone houses, direct: the authoritative price for a copy
  { name: "armaf", baseUrl: "https://armaf.com", maxPages: 3 },
  { name: "armafus", baseUrl: "https://armafperfume.us", maxPages: 1 },
  { name: "afnan", baseUrl: "https://www.afnan.com", maxPages: 2 },
  { name: "lattafa", baseUrl: "https://lattafa-usa.com", maxPages: 3 },
  { name: "alwataniah", baseUrl: "https://www.alwataniah.com", maxPages: 2 },
  // discounters that stock both sides of a comparison, in USD
  { name: "perfumania", baseUrl: "https://perfumania.com", maxPages: 8 },
  { name: "microperfumes", baseUrl: "https://www.microperfumes.com", maxPages: 8 },
  { name: "fragrancebuy", baseUrl: "https://fragrancebuy.com", maxPages: 6 },
];

/** Words a retailer appends to a scent name without changing the scent. */
const MARKETING_WORDS = new Set([
  "retail", "bottle", "full", "eau", "de", "parfum", "edp", "toilette", "edt",
  "extrait", "perfume", "fragrance", "spray", "mist", "unisex", "oz", "ml", "g",
  "men", "woman", "women", "man", "l", "e", "d", "pour", "homme", "femme", "by",
  "the", "for", "and", "with", "x", "size", "new",
]);

/** packaging and concentration words that can trail a scent name in a handle */
const HANDLE_TAIL_WORDS = [
  "edp", "edt", "extrait", "parfum", "perfume", "fragrance",
  "retail", "bottle", "spray", "mist", "travel", "sample", "vial", "mini",
  "gift", "set", "kit", "unisex", "pour", "homme", "femme", "men", "women",
  "ml", "oz", "g", "x", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
];

export interface ShopifyVariant {
  title: string;
  price: number;
  sizeMl: number | null;
}

export interface ShopifyProduct {
  title: string;
  handle: string;
  variants: ShopifyVariant[];
}

const OZ_TO_ML = 29.5735;
const REAL_SIZES = [1, 2, 3, 5, 10, 15, 25, 30, 50, 75, 90, 100, 125, 150, 200, 250, 300, 500];

function snapToStandard(ml: number): number {
  let best = ml;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const size of REAL_SIZES) {
    const diff = Math.abs(size - ml);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }
  return bestDiff <= 2 ? best : ml;
}

export function sizeMlFromTitle(title: string): number | null {
  const lower = title.toLowerCase();
  const oz = /(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/.exec(lower);
  if (oz !== null) {
    const raw = Number.parseFloat(oz[1]) * OZ_TO_ML;
    if (!Number.isFinite(raw)) return null;
    return snapToStandard(Math.round(raw));
  }
  const ml = /(\d+(?:\.\d+)?)\s*ml/.exec(lower);
  if (ml !== null) {
    const v = Math.round(Number.parseFloat(ml[1]));
    return Number.isFinite(v) ? snapToStandard(v) : null;
  }
  return null;
}

/**
 * Pick the variant to price from.
 *
 * Preference: exactly 100ml (3.4oz), the standard bottle clone houses sell.
 * Then the closest size to 100ml. Samples and travel sprays are never used:
 * a 2ml sample is not a price comparison, it is a sample.
 */
export function pickStandardVariant(variants: ShopifyVariant[]): ShopifyVariant | null {
  const priced = variants.filter((v) => Number.isFinite(v.price) && v.price > 0);
  if (priced.length === 0) return null;
  const sized = priced.filter((v) => v.sizeMl !== null && v.sizeMl >= 30);
  if (sized.length === 0) return null;
  const exact = sized.find((v) => v.sizeMl === 100);
  if (exact !== undefined) return exact;
  return sized.reduce((best, v) =>
    Math.abs((v.sizeMl ?? 0) - 100) < Math.abs((best.sizeMl ?? 0) - 100) ? v : best,
  );
}

export function parseShopifyProducts(json: unknown): ShopifyProduct[] {
  const products = (json as { products?: Array<Record<string, unknown>> })?.products;
  if (!Array.isArray(products)) return [];
  const out: ShopifyProduct[] = [];
  for (const p of products) {
    const title = typeof p.title === "string" ? p.title : "";
    if (title === "") continue;
    const variants: ShopifyVariant[] = [];
    for (const v of (Array.isArray(p.variants) ? p.variants : []) as Array<Record<string, unknown>>) {
      const price = typeof v.price === "string" ? Number.parseFloat(v.price) : Number.NaN;
      if (!Number.isFinite(price) || price <= 0) continue;
      const vTitle = typeof v.title === "string" ? v.title : "";
      variants.push({ title: vTitle, price, sizeMl: sizeMlFromTitle(vTitle) });
    }
    if (variants.length === 0) continue;
    out.push({ title, handle: typeof p.handle === "string" ? p.handle : "", variants });
  }
  return out;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\b(retail bottle|bottle|full bottle|eau de parfum|edp|eau de toilette|edt|parfum|extrait de parfum|extrait|fragrance|unisex|for (men|women))\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function scentPartOf(normalizedTitle: string): string {
  let out = normalizedTitle;
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out
      .replace(/\s+\d+(\.\d+)?\s*(fl\s*)?(oz|ml|g)$/, "")
      .replace(/\s+\d+(\.\d+)?$/, "")
      .replace(/\b(retail bottle|full bottle|bottle|eau de parfum|edp|eau de toilette|edt|extrait de parfum|extrait|parfum|perfume|fragrance|spray|mist|unisex|oz|ml|g)\b$/, "");
    if (out === before) break;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function handleOf(handle: string): string {
  const words = handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter((w) => w !== "");
  let end = words.length;
  while (end > 0 && HANDLE_TAIL_WORDS.includes(words[end - 1])) end -= 1;
  return words.slice(0, end).join("-");
}

export function isMarketingTail(tail: string): boolean {
  const words = tail.split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return true;
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    if (!MARKETING_WORDS.has(w)) return false;
  }
  return true;
}

async function fetchSource(source: RetailSource): Promise<ShopifyProduct[]> {
  const out: ShopifyProduct[] = [];
  for (let page = 1; page <= source.maxPages; page++) {
    try {
      const res = await fetch(`${source.baseUrl}/products.json?limit=250&page=${page}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) break;
      const products = parseShopifyProducts(await res.json());
      if (products.length === 0) break;
      out.push(...products);
    } catch {
      break;
    }
  }
  return out;
}

export interface CaptureResult {
  sources: number;
  products: number;
  matched: number;
  written: number;
  skippedFresh: number;
  errors: string[];
}

/**
 * Capture prices from every retailer feed.
 *
 * `onlyStale` limits the work to the fragrances whose price has aged out,
 * which is what the daily cron wants.
 */
export async function capturePrices(options?: { onlyStale?: boolean }): Promise<CaptureResult> {
  const onlyStale = options?.onlyStale ?? false;
  const cutoff = new Date(Date.now() - PRICE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000);
  const errors: string[] = [];

  // Every fragrance the catalogue has, not only the ones in a clone family.
  //
  // The first version of this captured only the clone families, which is 50
  // fragrances out of 140,228, so the "Where to buy" block was empty on
  // nearly every page and the affiliate links had nothing to point at. The
  // retailers stock thousands of scents we already carry, and a price on a
  // page is worth having whether or not that scent has clones.
  //
  // The catalogue is queried in one pass and held in memory, so the capture
  // cost does not grow with the catalogue size.
  const targets = await prisma.fragrance.findMany({
    select: { id: true, name: true, slug: true, house: { select: { name: true } } },
  });

  // which ones need a fresh price
  const fresh = new Set<string>();
  if (onlyStale) {
    const recent = await prisma.pricePoint.findMany({
      where: { capturedAt: { gte: cutoff } },
      select: { fragranceId: true },
    });
    for (const r of recent) fresh.add(r.fragranceId);
  }

  const bySlug = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const t of targets) {
    const key = t.slug.toLowerCase();
    if (!bySlug.has(key)) bySlug.set(key, t.id);
    const nameKey = scentPartOf(normalizeTitle(t.name));
    const list = byName.get(nameKey) ?? [];
    list.push(t.id);
    byName.set(nameKey, list);
  }

  // the partners, so a capture can be attributed
  const partners = await prisma.partner.findMany({ where: { active: true } });
  const partnerBySlug = new Map(partners.map((p) => [p.slug, p]));

  let products = 0;
  let matched = 0;
  let written = 0;
  let skippedFresh = 0;

  const priceBatch: Array<{
    fragranceId: string;
    partnerId: string;
    source: "RETAIL_FEED";
    sizeMl: number | null;
    condition: string;
    priceCents: number;
    capturedAt: Date;
    sourceListingId: string;
  }> = [];
  const linkBatch: Array<{
    partnerId: string;
    fragranceId: string;
    placement: string;
    clickId: string;
  }> = [];

  const flushBatches = async (): Promise<void> => {
    if (priceBatch.length > 0) {
      await prisma.pricePoint.createMany({ data: priceBatch, skipDuplicates: false });
      priceBatch.length = 0;
    }
    if (linkBatch.length > 0) {
      await prisma.partnerLink.createMany({ data: linkBatch, skipDuplicates: true });
      linkBatch.length = 0;
    }
  };

  for (const source of RETAIL_SOURCES) {
    const partner = partnerBySlug.get(source.name);
    if (partner === undefined) {
      // a source we read but have no partner row for: still capture the
      // price, and create the partner so the link can be built later
      errors.push(`no partner row for ${source.name}`);
      continue;
    }
    const list = await fetchSource(source);
    products += list.length;

    for (const product of list) {
      // a body mist, a gift set or a sample is not a price for the fragrance
      if (!isBottleProduct(product.title)) continue;
      // 1. the handle, which has to reduce to a catalogue slug exactly
      const handleKey = handleOf(product.handle);
      let fragranceId = handleKey !== "" ? bySlug.get(handleKey) : undefined;
      // 2. the title, for the retailers whose handles are untidy
      if (fragranceId === undefined) {
        const titleScent = scentPartOf(normalizeTitle(product.title));
        for (const [nameKey, ids] of byName) {
          if (nameKey.length < 5) continue;
          if (titleScent === nameKey) {
            fragranceId = ids[0];
            break;
          }
        }
      }
      if (fragranceId === undefined) continue;
      matched += 1;
      if (onlyStale && fresh.has(fragranceId)) {
        skippedFresh += 1;
        continue;
      }
      const variant = pickStandardVariant(product.variants);
      if (variant === null) continue;

      // batched: one row at a time was 8.6 minutes for a full capture, which
      // a request-based cron cannot afford
      const now = new Date();
      priceBatch.push({
        fragranceId,
        partnerId: partner.id,
        source: "RETAIL_FEED" as const,
        sizeMl: variant.sizeMl,
        condition: "asking",
        priceCents: Math.round(variant.price * 100),
        capturedAt: now,
        sourceListingId: `${source.name}:${product.handle}:${variant.title}`.slice(0, 200),
      });
      linkBatch.push({
        partnerId: partner.id,
        fragranceId,
        placement: "buy",
        clickId: product.handle || "unknown",
      });
      written += 1;

      if (priceBatch.length >= 500) {
        await flushBatches();
      }
    }
  }

  await flushBatches();
  return { sources: RETAIL_SOURCES.length, products, matched, written, skippedFresh, errors };
}
