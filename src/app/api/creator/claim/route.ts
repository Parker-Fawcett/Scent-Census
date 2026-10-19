import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claimCreator } from "@/server/creators";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ claimed: false, reason: "sign in first" }, { status: 401 });
  }
  let body: { token?: string } = {};
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return NextResponse.json({ claimed: false, reason: "invalid body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  const result = await claimCreator(prisma, session.user.id, token);
  return NextResponse.json(result);
}
