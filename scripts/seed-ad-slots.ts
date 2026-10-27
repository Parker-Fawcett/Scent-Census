// Seed the ad slots.
//
// Four slots, ON PURPOSE, to show every shape and to prove the exclusion
// rule works:
//
// 1. HOUSE AD for a specific scent, on that scent's own page. Renders:
//    a house advertising its own product on its own page is ordinary
//    retail, and it is the inventory a fragrance house actually wants.
//
// 2. HOUSE AD for a scent, on a page whose ranking LISTS that scent.
//    Suppressed: a reader would read the ranking as an endorsement.
//
// 3. GENERIC COMPANY AD, which promotes no scent. Renders anywhere: it
//    cannot be mistaken for a census result because it names no fragrance.
//
// 4. A slot for a house that owns a scent in the family, with a generic
//    ad. Renders, because it names no specific scent to confuse the
//    ranking with.
//
// If the exclusion rule breaks, slot 2 shows up on a page that ranks the
// scent it advertises, and the census becomes a pay-to-play list.

import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  const armaf = await prisma.house.findFirst({ where: { name: "Armaf" } });
  const lattafa = await prisma.house.findFirst({ where: { name: "Lattafa Perfumes" } });
  if (armaf === null || lattafa === null) {
    console.error("could not find the houses to sponsor with");
    process.exit(1);
  }
  const cdnim = await prisma.fragrance.findUnique({ where: { slug: "club-de-nuit-intense-man" } });
  const tresNuit = await prisma.fragrance.findUnique({ where: { slug: "tres-nuit" } });
  if (cdnim === null || tresNuit === null) {
    console.error("could not find the fragrances");
    process.exit(1);
  }

  // Explicit start times so the demo is deterministic. The house ad for a
  // scent is the newest, so it wins the page it belongs on.
  const now = Date.now();
  const hour = 3600_000;
  const t0 = new Date(now - 4 * hour);
  const t1 = new Date(now - 3 * hour);
  const t2 = new Date(now - 2 * hour);
  const t3 = new Date(now - 1 * hour);

  // 1. house ad for a scent, on that scent's own page
  await prisma.adSlot.upsert({
    where: { id: "slot-house-own-scent" },
    create: {
      id: "slot-house-own-scent",
      placement: "page-bottom",
      headline: "Club de Nuit Intense Man, direct from Armaf",
      body: "The house that makes it. 100ml, shipped from the source.",
      ctaText: "Shop at Armaf",
      ctaUrl: "https://armaf.com",
      sponsorHouseId: armaf.id,
      fragranceId: cdnim.id,
      startsAt: t3,
    },
    update: { sponsorHouseId: armaf.id, fragranceId: cdnim.id, startsAt: t3 },
  });

  // 2. house ad for a scent, for a page whose ranking lists that scent.
  //    Suppressed on that page, and that is the point.
  await prisma.adSlot.upsert({
    where: { id: "slot-house-ranked-scent" },
    create: {
      id: "slot-house-ranked-scent",
      placement: "page-bottom",
      headline: "Lattafa Asad",
      body: "A designer-style scent from Lattafa, with its own clones.",
      ctaText: "Shop Asad",
      ctaUrl: "https://lattafa-usa.com",
      sponsorHouseId: lattafa.id,
      fragranceId: (await prisma.fragrance.findUnique({ where: { slug: "asad" } }))?.id ?? null,
      startsAt: t2,
    },
    update: { startsAt: t2 },
  });

  // 3. generic company ad, promoting no fragrance at all
  await prisma.adSlot.upsert({
    where: { id: "slot-company-generic" },
    create: {
      id: "slot-company-generic",
      placement: "page-bottom",
      headline: "Scent Census, in your pocket",
      body: "Track every bottle you own and see which clones the community says actually smell close.",
      ctaText: "Start your shelf",
      ctaUrl: "https://scentcensus.com/signin",
      sponsorHouseId: null,
      fragranceId: null,
      startsAt: t1,
    },
    update: { startsAt: t1 },
  });

  // 4. a house ad that names no specific scent, for any page
  await prisma.adSlot.upsert({
    where: { id: "slot-house-generic" },
    create: {
      id: "slot-house-generic",
      placement: "below-fold",
      headline: "Lattafa Perfumes",
      body: "A hundred fragrances, most of them under thirty dollars a bottle.",
      ctaText: "Browse Lattafa",
      ctaUrl: "https://lattafa-usa.com",
      sponsorHouseId: lattafa.id,
      fragranceId: null,
      startsAt: t0,
    },
    update: { startsAt: t0 },
  });

  console.log(`slots: ${await prisma.adSlot.count()}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
