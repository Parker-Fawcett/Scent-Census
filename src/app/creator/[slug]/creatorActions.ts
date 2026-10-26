"use server";

// Logging a creator's own pickup or review on their claimed page.
// Gated to the claiming account inside logCreatorPickup itself.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logCreatorPickup } from "@/server/creators";

export async function logCreatorPickupAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const creatorId = String(formData.get("creatorId") ?? "");
  const creatorSlug = String(formData.get("creatorSlug") ?? "");
  const fragranceSlug = String(formData.get("fragranceSlug") ?? "");
  const url = String(formData.get("url") ?? "");
  const title = String(formData.get("title") ?? "") || undefined;
  const kind = String(formData.get("kind") ?? "review");

  if (creatorId === "" || creatorSlug === "" || fragranceSlug === "" || url === "") {
    redirect(`/creator/${creatorSlug}`);
  }

  const fragrance = await prisma.fragrance.findUnique({
    where: { slug: fragranceSlug },
    select: { id: true },
  });
  if (fragrance === null) {
    redirect(`/creator/${creatorSlug}`);
  }

  try {
    await logCreatorPickup(prisma, session.user.id, {
      creatorId,
      fragranceId: fragrance.id,
      url,
      title,
      kind: kind === "pickup" ? "pickup" : "review",
    });
  } catch (error) {
    console.error("creator pickup failed:", error instanceof Error ? error.message : error);
  }

  redirect(`/creator/${creatorSlug}`);
}
