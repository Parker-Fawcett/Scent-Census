"use server";

// Census voting actions for the product page (same explicit-redirect pattern
// as the feed: a void action on a dynamic page returns an empty flight, so
// every mutation ends in a redirect that re-renders the changed census).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearCloneVoteForUser, saveCloneVote } from "@/server/census";
import { emitUpdateEvent, toggleFollow } from "@/server/follows";

export async function cloneCensusVoteAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const slug = String(formData.get("slug") ?? "");
  const cloneId = String(formData.get("cloneId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const bucket = String(formData.get("bucket") ?? "");
  try {
    await saveCloneVote(prisma, session.user.id, { cloneId, targetId, bucket });
  } catch (error) {
    // tampered buckets or ids never surface a stack to the visitor; the
    // redirect back lets the page show the (unchanged) census truth
    console.error("census vote failed:", error instanceof Error ? error.message : error);
  }
  redirect(`/fragrance/${slug}`);
}

export async function clearCloneVoteAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const slug = String(formData.get("slug") ?? "");
  const cloneId = String(formData.get("cloneId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  await clearCloneVoteForUser(prisma, session.user.id, cloneId, targetId);
  redirect(`/fragrance/${slug}`);
}

export async function toggleFollowAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const slug = String(formData.get("slug") ?? "");
  const subjectType = String(formData.get("subjectType") ?? "FRAGRANCE") as
    | "FRAGRANCE"
    | "HOUSE"
    | "CREATOR";
  const subjectId = String(formData.get("subjectId") ?? "");
  await toggleFollow(prisma, session.user.id, { subjectType, subjectId });
  redirect(`/fragrance/${slug}`);
}

