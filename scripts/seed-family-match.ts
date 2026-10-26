import { PrismaClient } from "@prisma/client";
import { scentFamilyMatch } from "../src/domain/cloneClaims";

const prisma = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 0;
const resumeArg = process.argv.find((a) => a.startsWith("--resume="));
const resume = resumeArg ? parseInt(resumeArg.split("=")[1]) : 0;

function accordWeights(accords: string[]): Record<string, number> {
  return Object.fromEntries(accords.map((a, i) => [a.toLowerCase(), 100 - i * 12.5]));
}

function bucketFor(score: number): "SPOT_ON" | "CLOSE" | "SIMILAR" | "SAME_FAMILY" | "NOT_CLOSE" {
  if (score >= 80) return "SPOT_ON";
  if (score >= 60) return "CLOSE";
  if (score >= 40) return "SIMILAR";
  if (score >= 25) return "SAME_FAMILY";
  return "NOT_CLOSE";
}

function confidenceFor(noteCount: number, accordCount: number): string {
  if (noteCount >= 5 && accordCount >= 3) return "high";
  if (noteCount >= 3 && accordCount >= 1) return "medium";
  return "low";
}

async function main() {
  console.log("Loading fragrances with notes and accords...");

  const fragrances = await prisma.fragrance.findMany({
    include: { notes: { include: { note: true } } },
  });

  const fragMap = new Map(
    fragrances.map((f) => [
      f.id,
      {
        notes: f.notes.map((n) => n.note.name),
        accords: f.accords,
        noteCount: f.notes.length,
        accordCount: f.accords.length,
      },
    ]),
  );

  console.log(`Loaded ${fragrances.length} fragrances.`);

  const edges = await prisma.inspiredByEdge.findMany({
    select: { cloneId: true, targetId: true, upVotes: true, downVotes: true },
  });

  console.log(`Found ${edges.length} edges to seed.`);

  const toProcess = (limit > 0 ? edges.slice(0, limit) : edges).slice(resume);
  let written = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches of 50 using a transaction
  const BATCH = 50;
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH);
    const ops = [];

    for (const edge of batch) {
      const clone = fragMap.get(edge.cloneId);
      const target = fragMap.get(edge.targetId);

      if (!clone || !target) {
        skipped++;
        continue;
      }

      const score = scentFamilyMatch(
        target.notes,
        accordWeights(target.accords),
        clone.notes,
        accordWeights(clone.accords),
      );

      const conf = confidenceFor(
        Math.min(clone.noteCount, target.noteCount),
        Math.min(clone.accordCount, target.accordCount),
      );

      const bucket = bucketFor(score);

      if (!dryRun) {
        ops.push(
          prisma.communitySeed.upsert({
            where: { cloneId_targetId: { cloneId: edge.cloneId, targetId: edge.targetId } },
            create: {
              cloneId: edge.cloneId,
              targetId: edge.targetId,
              bucket: bucket as any,
              score,
              confidence: conf,
              sampleSize: edge.upVotes + edge.downVotes,
              source: "computed from public note and accord lists",
              sourceUrl: null,
              methodology: "scent family match: 50% accord cosine + 50% note Jaccard, computed from Fragrantica corpus note and accord data",
            },
            update: {
              bucket: bucket as any,
              score,
              confidence: conf,
              sampleSize: edge.upVotes + edge.downVotes,
              source: "computed from public note and accord lists",
              methodology: "scent family match: 50% accord cosine + 50% note Jaccard, computed from Fragrantica corpus note and accord data",
            },
          }),
        );
      }
      written++;
    }

    if (!dryRun && ops.length > 0) {
      try {
        await prisma.$transaction(ops);
      } catch (err) {
        failed += ops.length;
        if (failed <= 5) console.error(`  BATCH FAIL at ${i}: ${(err as Error).message}`);
      }
    }

    if (i % 500 === 0 && i > 0) {
      console.log(`  processed ${i + resume}/${edges.length}...`);
    }
  }

  console.log(`\n${dryRun ? "would write" : "wrote"} ${written} seeds, ${skipped} skipped, ${failed} failed`);
  console.log(`Resume from: --resume=${resume + written + skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
