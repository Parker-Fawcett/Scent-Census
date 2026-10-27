// What the visitor already owns, and what that changes about a page.
//
// The premise of the site is that your shelf drives your next bottle. A
// product page that reads identically for someone with a shelf and someone
// without one throws that away.
//
// Three things a shelf should change on a fragrance page:
//
//   1. "You own this" on the page's own fragrance, and on any clone in its
//      family that is also on the shelf.
//   2. A line naming the closest clone to something they own, when the page
//      is about an original and they own one of its clones (or the other way
//      around).
//   3. The order of the census list: the clones closest to what they own
//      float up, because a comparison to your own bottle is the one you
//      care about.
//
// Nothing here touches a score, a vote count, or a rank position in the
// data. It reorders the view for one reader, and the ranking a stranger
// sees is unchanged. The census is the same census for everyone; the
// reading of it is personal.

import { prisma } from "@/lib/prisma";
import type { PrismaInstance } from "@/lib/prisma";

export interface ShelfFacts {
  /** the ids of everything on the visitor's shelf */
  ownedIds: Set<string>;
  /** the ids of the fragrances in this page's family that they own */
  ownedInFamily: string[];
  /** a scent they own that is closest to this page's subject */
  nearestOwned: { id: string; name: string; slug: string; score: number } | null;
  /** the closest clone in this family to the scent they own, if any */
  closestToOwned: { id: string; name: string; slug: string; score: number } | null;
}

/**
 * The shelf facts for one page.
 *
 * `family` is the list of clone ids in the page's census, with their
 * measured closeness to the subject.
 */
export async function loadShelfFacts(
  db: PrismaInstance,
  userId: string | null,
  subjectId: string,
  family: Array<{ id: string; name: string; slug: string; score: number }>,
): Promise<ShelfFacts> {
  if (userId === null) {
    return { ownedIds: new Set(), ownedInFamily: [], nearestOwned: null, closestToOwned: null };
  }

  const owned = await db.collectionItem.findMany({
    where: { userId },
    select: { fragranceId: true },
  });
  const ownedIds = new Set(owned.map((o) => o.fragranceId));

  const ownedInFamily = family
    .filter((f) => ownedIds.has(f.id))
    .map((f) => f.id);

  // the closest thing they own to this subject: if they own the subject
  // itself, that is the answer
  const nearestOwned = family.find((f) => f.id === subjectId) ?? null;

  // if they own a clone in this family, which clone is closest to the one
  // they own? every family member is a copy of the same original, so this
  // asks which of them the community agrees is closest
  let closestToOwned: ShelfFacts["closestToOwned"] = null;
  if (ownedInFamily.length > 0 && nearestOwned === null) {
    const ranked = [...family].sort((a, b) => b.score - a.score);
    const best = ranked.find((f) => ownedInFamily.includes(f.id));
    if (best !== undefined) {
      closestToOwned = best;
    }
  }

  return { ownedIds, ownedInFamily, nearestOwned, closestToOwned };
}
