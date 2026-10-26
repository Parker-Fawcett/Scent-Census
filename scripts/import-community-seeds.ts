import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import path from "node:path";
import type { CensusBucket } from "@prisma/client";

async function main() {
  const file = path.join(process.cwd(), "data", "community-seeds.json");
  const seeds = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{
    cloneSlug: string;
    targetSlug: string;
    bucket: string;
    score: number;
    confidence: string;
    sampleSize: number | null;
    source: string;
    sourceUrl: string | null;
    methodology: string;
  }>;

  let upserted = 0;
  for (const s of seeds) {
    const clone = await prisma.fragrance.findUnique({ where: { slug: s.cloneSlug }, select: { id: true } });
    const target = await prisma.fragrance.findUnique({ where: { slug: s.targetSlug }, select: { id: true } });
    if (!clone || !target) {
      console.warn("skip (missing):", s.cloneSlug, "->", s.targetSlug);
      continue;
    }
    await prisma.communitySeed.upsert({
      where: { cloneId_targetId: { cloneId: clone.id, targetId: target.id } },
      create: {
        cloneId: clone.id,
        targetId: target.id,
        bucket: s.bucket as CensusBucket,
        score: s.score,
        confidence: s.confidence,
        sampleSize: s.sampleSize,
        source: s.source,
        sourceUrl: s.sourceUrl,
        methodology: s.methodology,
      },
      update: {
        bucket: s.bucket as CensusBucket,
        score: s.score,
        confidence: s.confidence,
        sampleSize: s.sampleSize,
        source: s.source,
        sourceUrl: s.sourceUrl,
        methodology: s.methodology,
      },
    });
    upserted++;
  }
  console.log(`upserted ${upserted} / ${seeds.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});