// Approved clone-edge loader CLI: reads curation/clone-edges.approved.json,
// resolves each corpus fid pair through catalogueSourcePid, applies the low
// friction idempotent moves, and prints the summary loud. Reruns are no-ops
// by design; unfamiliar fids fail the run instead of loading a wrong edge.

import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { loadApprovedCloneEdges } from "../src/server/curation";

interface ApprovedFile {
  _comment?: string;
  edges: Array<{ cloneFid: string; targetFid: string; note?: string; replace?: boolean }>;
}

function parseArgs(): { file: string } {
  const args = process.argv.slice(2);
  const i = args.indexOf("--file");
  const file = i >= 0 ? args[i + 1] : undefined;
  if (!file) {
    console.error("usage: tsx scripts/load-clone-edges.ts --file curation/clone-edges.approved.json");
    process.exit(2);
  }
  return { file };
}

async function main(): Promise<void> {
  const { file } = parseArgs();
  const parsed = JSON.parse(readFileSync(file, "utf8")) as ApprovedFile;
  const summary = await loadApprovedCloneEdges(prisma, parsed.edges);
  console.log(`applied: ${summary.applied}`);
  console.log(`already linked: ${summary.alreadyLinked}`);
  console.log(`alternates (recorded, not linked): ${summary.alternates}`);
  for (const refusal of summary.refused) {
    console.log(`refused: ${refusal.cloneFid} -> ${refusal.targetFid}: ${refusal.reason}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
