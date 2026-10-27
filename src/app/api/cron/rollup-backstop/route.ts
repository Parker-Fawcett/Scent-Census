import { NextResponse } from "next/server";
import { env } from "@/config";
import { prisma } from "@/lib/prisma";
import { recomputePairRollup } from "@/server/census";

function authorized(request: Request): boolean {
  if (env.cronSecret === null) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.cronSecret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // every pair that has been voted on; recomputing all of them daily is the
  // backstop for the in-transaction recompute that runs on every vote
  const pairs = await prisma.cloneVote.findMany({
    distinct: ["cloneId", "targetId"],
    select: { cloneId: true, targetId: true },
  });
  let recomputed = 0;
  for (const pair of pairs) {
    await recomputePairRollup(prisma, pair.cloneId, pair.targetId);
    recomputed += 1;
  }
  // zero-vote rows left behind before clears deleted them; they carry no
  // measurement and would otherwise shadow the pair's smell-alike counts
  const { count: emptied } = await prisma.cloneRollup.deleteMany({ where: { sampleSize: 0 } });
  return NextResponse.json({ recomputed, emptied });
}
