// Seed the verified creator roster (PRD section 11) as UNCLAIMED rows and
// mint their claim tokens. Tokens are printed to stdout; delivery (email
// or DM) is a human step. Idempotent by slug.

import { prisma } from "../src/lib/prisma";
import { mintClaimToken } from "../src/server/creators";

const ROSTER = [
  { slug: "cal-cologne", name: "Cal Cologne", platforms: { youtube: "https://youtube.com/@CalCologne" } },
  { slug: "gents-scents", name: "Gents Scents", platforms: { youtube: "https://youtube.com/gentsscents" } },
  { slug: "cuba-know", name: "Cuba Know", platforms: { youtube: "" } },
  { slug: "fb-fragrances", name: "FB Fragrances", platforms: { youtube: "https://youtube.com/@FBFragrances", tiktok: "" } },
  { slug: "top-frag", name: "Top Frag", platforms: { tiktok: "@topfrag.official" } },
  { slug: "fragrance-flan", name: "Fragrance Flan", platforms: { youtube: "https://youtube.com/@FragranceFlan" } },
];

async function main(): Promise<void> {
  for (const entry of ROSTER) {
    const existing = await prisma.creator.findUnique({ where: { slug: entry.slug } });
    const creator =
      existing ??
      (await prisma.creator.create({
        data: { slug: entry.slug, name: entry.name, platforms: entry.platforms, status: "UNCLAIMED" },
      }));
    const token = mintClaimToken(creator.id);
    console.log(`${creator.name} (${creator.slug}): ${creator.status}`);
    console.log(`  claim URL: /creator/claim  token=${token}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
