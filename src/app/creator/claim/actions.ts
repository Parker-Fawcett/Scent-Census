"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claimCreator } from "@/server/creators";

export async function claimCreatorAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/creator/claim?error=sign+in+first");
  const token = String(formData.get("token") ?? "").trim();
  const result = await claimCreator(prisma, session.user.id, token);
  if (result.claimed && result.creatorSlug) {
    redirect(`/creator/claim?claimed=${encodeURIComponent(result.creatorSlug)}`);
  }
  redirect(`/creator/claim?error=${encodeURIComponent(result.reason ?? "not claimed")}`);
}
