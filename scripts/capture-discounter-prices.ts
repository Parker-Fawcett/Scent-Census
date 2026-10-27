// Discounter price capture.
//
// WHERE THE PRICES COME FROM, and why not eBay:
// the original side of a clone comparison is a designer bottle, and eBay is
// grey market and resale. A used Aventus sells for well under retail, and
// "authenticity guaranteed" resellers mark clones up. Neither end of the
// comparison is what a buyer pays.
//
// What buyers actually pay comes from two places:
//   1. the discounter index: Fragrantica's own "Online shops offers" block on
//      a perfume page lists Jomashop, FragranceNet, MicroPerfumes,
//      FragranceX, Perfumania and friends with their live asking ranges.
//      That block is the discounter market, already aggregated, and it
//      covers both designer originals and clone houses.
//   2. the clone house's own retail: armaf.com, afnan.com and friends sell
//      direct, and their Shopify feeds are the cheapest legitimate price.
//
// This capture reads source 1 for any fragrance we can match by pid.
//
// HONESTY RULES:
//   - the range is a set of live ASKING prices at discounters, never sold
//     prices, and the UI says so;
//   - the low end of a discounter range is often a 2ml sample, so the range
//     is stored with the size when the source states one, and the UI shows
//     the size;
//   - a missing capture means "no confident price", never a guess;
//   - every capture records when it was taken, and stale captures are
//     excluded from the estimate.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "../src/lib/prisma";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface ShopOffer {
  shop: string;
  itemCount: number;
  lowCents: number;
  highCents: number;
}

export interface DiscounterCapture {
  pid: number;
  headlineCents: number | null;
  offers: ShopOffer[];
  capturedAt: Date;
}

/**
 * Parse the price block out of a Fragrantica perfume page.
 *
 * The block looks like:
 *   Online shops offers:<br />
 *   <a ...><b>Jomashop.com</b> 12 items for <b>9.67 - 59.99</b> USD</a><br />
 *   ...
 * and above it a headline "Armaf Mens Club De Nuit Intense Body... (9.67 USD)".
 *
 * The structure is a stable markup pattern, so this parses by shape rather
 * than by brittle selectors.
 */
export function parseOffers(html: string): { headlineCents: number | null; offers: ShopOffer[] } {
  const offers: ShopOffer[] = [];
  const seen = new Set<string>();

  // "12 items for 9.67 - 59.99 USD" inside the offer block
  const offerRe = /<b>([A-Za-z0-9][A-Za-z0-9.\- ]{1,40}\.(?:com|net|org|co\.uk|us))<\/b>\s*(\d+)\s*items?\s*for\s*<b>\s*([\d.]+)\s*(?:-\s*([\d.]+)\s*)?<\/b>\s*USD/gi;
  let m: RegExpExecArray | null;
  while ((m = offerRe.exec(html)) !== null) {
    const shop = m[1].trim();
    if (seen.has(shop)) continue;
    seen.add(shop);
    const itemCount = Number.parseInt(m[2], 10);
    const low = Math.round(Number.parseFloat(m[3]) * 100);
    const high = m[4] !== undefined ? Math.round(Number.parseFloat(m[4]) * 100) : low;
    if (!Number.isFinite(low) || low <= 0) continue;
    offers.push({ shop, itemCount: Number.isFinite(itemCount) ? itemCount : 0, lowCents: low, highCents: high });
  }

  // the headline "Some Perfume (9.67 USD)" that sits above the list
  let headlineCents: number | null = null;
  const headlineRe = /\(\s*<b>(\d+(?:\.\d+)?)\s*<\/b>\s*(?:USD|EUR|GBP)\s*\)/i;
  const hm = headlineRe.exec(html);
  if (hm !== null) {
    const v = Math.round(Number.parseFloat(hm[1]) * 100);
    if (Number.isFinite(v) && v > 0) headlineCents = v;
  }

  return { headlineCents, offers };
}

/** Fractional sizes would distort a "from $X" claim, so they are dropped. */
export function isFullSize(sizeMl: number | null): boolean {
  return sizeMl === null || sizeMl >= 30;
}

function parseArgs(): { file: string; limit: number } {
  const file = process.argv.find((a) => a.startsWith("--file="));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const filePath = file !== undefined ? file.slice("--file=".length) : "";
  const limit = limitArg !== undefined ? Number.parseInt(limitArg.slice("--limit=".length), 10) : 200;
  if (filePath === "") {
    console.error("usage: capture-discounter-prices --file <perfumes.jsonl> [--limit=N]");
    process.exit(1);
  }
  return { file: filePath, limit };
}

async function main(): Promise<void> {
  const { file, limit } = parseArgs();
  const started = Date.now();

  // the fragrances worth pricing: the ones the census actually reaches, plus
  // every original in a clone family. A page nobody can reach does not need
  // a price.
  const targets = await prisma.fragrance.findMany({
    where: {
      OR: [
        { inspiredById: { not: null } },
        { inspiredClones: { some: {} } },
      ],
    },
    select: { id: true, name: true, catalogueSourcePid: true, house: { select: { name: true } } },
  });
  console.log(`fragrances in a clone family: ${targets.length}`);
  const pidToFragrance = new Map<string, string>();
  for (const t of targets) {
    if (t.catalogueSourcePid) pidToFragrance.set(t.catalogueSourcePid.replace("fragrantica-", ""), t.id);
  }

  // read the dump for the Fragrantica url + slug of each pid
  const wanted = new Set(pidToFragrance.keys());
  const urlByPid = new Map<string, string>();
  const stream = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of stream) {
    if (line.trim() === "") continue;
    let d: { id: number; slug: string; url: string };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (wanted.has(String(d.id))) urlByPid.set(String(d.id), d.url);
  }
  console.log(`urls resolved: ${urlByPid.size}`);

  let captured = 0;
  let withOffers = 0;
  let failed = 0;
  const DELAY_MS = 900;

  for (const [pid, fragranceId] of pidToFragrance) {
    if (captured >= limit) break;
    const url = urlByPid.get(pid);
    if (url === undefined) continue;

    let html: string;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
      if (!res.ok) {
        failed += 1;
        continue;
      }
      html = await res.text();
    } catch {
      failed += 1;
      continue;
    }

    const { headlineCents, offers } = parseOffers(html);
    if (offers.length === 0) {
      failed += 1;
      captured += 1;
      await new Promise((r) => setTimeout(r, DELAY_MS));
      continue;
    }
    withOffers += 1;

    const now = new Date();
    const points = offers.map((o) => ({
      fragranceId,
      source: "RETAIL_FEED" as const,
      sizeMl: null,
      condition: "asking",
      priceCents: o.lowCents,
      capturedAt: now,
      sourceListingId: `fragrantica:${pid}:${o.shop}:low`,
    }));
    for (const p of points) {
      await prisma.pricePoint.create({ data: p });
    }
    if (headlineCents !== null) {
      await prisma.pricePoint.create({
        data: {
          fragranceId,
          source: "RETAIL_FEED" as const,
          sizeMl: null,
          condition: "asking",
          priceCents: headlineCents,
          capturedAt: now,
          sourceListingId: `fragrantica:${pid}:headline`,
        },
      });
    }

    captured += 1;
    if (captured % 10 === 0) {
      console.log(`  ${captured}/${limit} captured (${withOffers} with offers, ${failed} without) ${new Date().toISOString().slice(11, 19)}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`done: ${captured} pages fetched, ${withOffers} with price offers, ${failed} without`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
