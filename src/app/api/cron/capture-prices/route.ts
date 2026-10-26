// The daily price capture.
//
// Prices go stale, and a stale price is worse than no price: a reader would
// act on a number from three weeks ago. So the capture runs on a schedule,
// and it only re-checks the fragrances whose price has aged past the
// freshness window.
//
// It is a cron route rather than a script because a script that nobody runs
// is a script that stops working. This one runs whether anyone remembers it.

import { NextResponse } from "next/server";
import { env } from "@/config";
import { capturePrices } from "@/server/priceCapture";

function authorized(request: Request): boolean {
  if (env.cronSecret === null) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.cronSecret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await capturePrices({ onlyStale: true });
  return NextResponse.json(result);
}
