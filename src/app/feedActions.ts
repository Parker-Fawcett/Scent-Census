"use server";

// Feed vote actions (PRD 7.3): one row per user+fragrance, revisionable, the
// shown reason rides along so we learn which reasons work. Same pattern as
// the shelf remove action (empirical, trace-verified): on a cacheComponents
// dynamic page a void action leaves the client on a stale frame, so every
// path ends in an explicit redirect that re-renders the feed without the
// item the user just voted on (the vote repository excludes all voted ids).

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveVote } from "@/server/votes";

function safeBack(formData: FormData): string {
  // keep the visitor on the same page slice; a tampered value just lands home
  const page = Number(formData.get("page") ?? "1");
  return Number.isInteger(page) && page > 0 ? `/?page=${page}` : "/";
}

export async function voteAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const back = safeBack(formData);
  const fragranceId = String(formData.get("fragranceId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const reasonSlugRaw = formData.get("reasonSlug");
  const reasonSlug = typeof reasonSlugRaw === "string" && reasonSlugRaw.trim() !== ""
    ? reasonSlugRaw.trim()
    : null;
  if (fragranceId === "" || direction === "") redirect(back);

  try {
    await saveVote(prisma, session.user.id, { fragranceId, direction, reasonSlug });
  } catch (error) {
    // bogus or tampered directions/ids never serve the client an error frame;
    // redirect home and let the feed rebuild from clean state
    console.error("vote failed:", error instanceof Error ? error.message : error);
  }
  redirect(back);
}

export async function morePicksAction(_formData: FormData): Promise<void> {
  void _formData;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  // advancing the feed is a deliberate POST, never a Link prefetch: the page
  // render legitimately records what it showed (FeedPageState), so an
  // auto-triggered GET would consume a page behind the user's back. The page
  // label in the URL is cosmetic only; the real advance lives in state.
  redirect("/");
}
