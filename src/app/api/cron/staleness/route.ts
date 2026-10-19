import { NextResponse } from "next/server";
import { env } from "@/config";
import { prisma } from "@/lib/prisma";

function authorized(request: Request): boolean {
  if (env.cronSecret === null) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.cronSecret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const estimates = await prisma.fragranceEstimate.updateMany({
    where: { computedAt: { lt: cutoff }, isStale: false },
    data: { isStale: true },
  });
  const rollups = await prisma.cloneRollup.updateMany({
    where: { computedAt: { lt: cutoff }, isStale: false },
    data: { isStale: true },
  });
  return NextResponse.json({ estimatesMarkedStale: estimates.count, rollupsMarkedStale: rollups.count });
}
