"use server";

// Owner-scoped removal (PRD 7.2: removing a bottle updates the worth summary
// in the same render). Data reads are uncached/dynamic, so the action's
// response re-renders the page with fresh numbers; there is no cache to
// reconcile. Probing stranger ids reveals nothing: the repository scope is
// the same one the tests pin.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeItem } from "@/server/collection";

export async function removeBottleAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const itemId = String(formData.get("itemId") ?? "");
  if (itemId === "") return;
  try {
    await removeItem(prisma, session.user.id, itemId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("not found for user")) throw error;
  }
}
