"use server";

// Add a bottle: server function reachable by direct POST, so it verifies the
// session itself (Next 16 data security rule). Ownership is added on insert.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateAddItem } from "@/domain/collection/addItem";
import { addItem } from "@/server/collection";

export async function addBottleAction(formData: FormData): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return "You are signed out. Sign in first.";

  const fragranceId = String(formData.get("fragranceId") ?? "");
  const sizeRaw = formData.get("sizeMl");
  const paid = String(formData.get("pricePaidDollars") ?? "");
  const date = String(formData.get("purchasedOn") ?? "");
  const sealed = formData.get("sealed") === "on";

  let parsed;
  try {
    parsed = validateAddItem({
      fragranceId,
      sizeMl: sizeRaw !== null && sizeRaw !== "" ? Number(sizeRaw) : null,
      pricePaidDollars: paid === "" ? null : paid,
      purchasedOn: date === "" ? null : date,
      sealed,
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : "Could not add bottle.";
    return cause.replace(/^add item: /, "");
  }

  try {
    await addItem(prisma, session.user.id, {
      fragranceId: parsed.fragranceId,
      sizeMl: parsed.sizeMl,
      batchCode: null,
      pricePaidCents: parsed.pricePaidCents,
      purchasedOn: parsed.purchasedOn,
      sealed: parsed.sealed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/constraint|foreign|invalid/i.test(message)) {
      return "That fragrance does not exist in the catalogue yet."; 
    }
    throw error;
  }
  redirect("/shelf");
}
