// Seed the retail partners, and attach the price captures we already took
// to the partner that gave us the price.
//
// The partner rows are the affiliate relationship. Until we are actually
// accepted into a network, `affiliateId` is null and the links are plain
// outbound links with our own click token, so the traffic is countable from
// day one and the commission is a one-column update when it arrives.

import { prisma } from "../src/lib/prisma";

const PARTNERS = [
  {
    slug: "perfumania",
    name: "Perfumania",
    network: "cj",
    baseUrl: "https://perfumania.com",
  },
  {
    slug: "microperfumes",
    name: "MicroPerfumes",
    network: "cj",
    baseUrl: "https://www.microperfumes.com",
  },
  {
    slug: "armaf",
    name: "Armaf",
    network: "direct",
    baseUrl: "https://armaf.com",
  },
  {
    slug: "afnan",
    name: "Afnan",
    network: "direct",
    baseUrl: "https://www.afnan.com",
  },
  {
    slug: "lattafa",
    name: "Lattafa",
    network: "direct",
    baseUrl: "https://lattafa-usa.com",
  },
  {
    slug: "alwataniah",
    name: "Al Wataniah",
    network: "direct",
    baseUrl: "https://www.alwataniah.com",
  },
  {
    slug: "armafus",
    name: "Armaf (US)",
    network: "direct",
    baseUrl: "https://armafperfume.us",
  },
  {
    slug: "fragrancebuy",
    name: "FragranceBuy",
    network: "direct",
    baseUrl: "https://fragrancebuy.com",
  },
];

async function main(): Promise<void> {
  for (const p of PARTNERS) {
    const partner = await prisma.partner.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        network: p.network,
        baseUrl: p.baseUrl,
      },
      update: { name: p.name, network: p.network, baseUrl: p.baseUrl },
    });

    // attach the captures that came from this partner
    const points = await prisma.pricePoint.findMany({
      where: { sourceListingId: { startsWith: `${p.slug}:` } },
      select: { id: true },
    });
    if (points.length > 0) {
      await prisma.pricePoint.updateMany({
        where: { id: { in: points.map((x) => x.id) } },
        data: { partnerId: partner.id },
      });
    }
    console.log(`${p.slug}: ${points.length} captures attached`);
  }

  // a link row for every priced fragrance, so a click has somewhere to land
  const priced = await prisma.pricePoint.findMany({
    where: { partnerId: { not: null } },
    select: { fragranceId: true, partnerId: true, sourceListingId: true },
  });
  const seen = new Set<string>();
  const payload: Array<{
    partnerId: string; fragranceId: string; placement: string; clickId: string;
  }> = [];
  for (const point of priced) {
    const key = `${point.partnerId}:${point.fragranceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    payload.push({
      partnerId: point.partnerId!,
      fragranceId: point.fragranceId,
      placement: "buy",
      clickId: point.sourceListingId?.split(":")[1] ?? "unknown",
    });
  }
  // one bulk insert, skipping the rows that already exist
  await prisma.partnerLink.createMany({ data: payload, skipDuplicates: true });
  console.log(`partner links: ${payload.length}`);

  const total = await prisma.partner.count();
  console.log(`partners: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
