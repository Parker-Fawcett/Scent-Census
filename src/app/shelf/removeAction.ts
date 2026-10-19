"use server";

// Owner-scoped removal (PRD 7.2: removing a bottle updates the worth summary
// in the same render). Empirical note from the e2e trace: on a cacheComponents
// dynamic page, a void server action returned an empty flight and the client
// never re-rendered, while the delete HAD happened (stale UI over fresh DB).
// An explicit redirect performs the same refresh as a navigation, so that is
// the pattern used here: delete, then redirect to the shelf that re-renders
// with current data. Probing stranger ids reveals nothing: the repository
// scope is the same one the tests pin.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeItem } from "@/server/collection";

export async function removeBottleAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const itemId = String(formData.get("itemId") ?? "");
  if (itemId === "") redirect("/shelf");
  try {
    await removeItem(prisma, session.user.id, itemId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("not found for user")) throw error;
  }
  redirect("/shelf");
}
