// Reading clone claims for a product page.
//
// The decision that matters here is ordering. A note match of 100 means the
// seller publishes the same note list as the original, and several sellers do,
// so the number cannot be the only sort key. Price breaks the tie and the
// unsourced rows go last, where they read as "named in the wild" rather than
// as scored alternatives.

import type { PrismaClient } from "@prisma/client";
import { compareClaimRows } from "@/domain/cloneClaims";

export interface ClaimRow {
  id: string;
  /** catalogue fragrance id when the product resolves, else null */
  cloneId: string | null;
  productName: string;
  houseName: string;
  claimType: "HOUSE_DECLARED" | "COMMUNITY_LIST" | "EDITORIAL";
  status: "MEASURED" | "UNMEASURED" | "OUTSIDE_CATALOGUE";
  sourceLabel: string;
  sourceUrl: string;
  verifiedOn: Date;
  noteMatch: number | null;
  familyMatch: number | null;
  textureNote: string | null;
  /** raw corpus votes when the pair was compared below the census floor */
  measuredUp: number | null;
  measuredDown: number | null;
  claimedSimilarity: string | null;
  priceCents: number | null;
  sizeMl: number | null;
  currency: string | null;
  discontinued: boolean;
  /** set when the product is in our catalogue, so the row can link to it */
  slug: string | null;
  pid: string | null;
}

export async function loadCloneClaims(
  prisma: PrismaClient,
  targetId: string,
): Promise<ClaimRow[]> {
  const rows = await prisma.cloneClaim.findMany({
    where: { targetId },
    include: {
      clone: { select: { slug: true, catalogueSourcePid: true } },
    },
  });

  const mapped: ClaimRow[] = rows.map((row) => ({
    id: row.id,
    cloneId: row.cloneId,
    productName: row.productName,
    houseName: row.houseName,
    claimType: row.claimType,
    status: row.status,
    sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl,
    verifiedOn: row.verifiedOn,
    noteMatch: row.noteMatch,
    familyMatch: row.familyMatch,
    textureNote: row.textureNote,
    measuredUp: row.measuredUp,
    measuredDown: row.measuredDown,
    claimedSimilarity: row.claimedSimilarity,
    priceCents: row.priceCents,
    sizeMl: row.sizeMl,
    currency: row.currency,
    discontinued: row.discontinued,
    slug: row.clone?.slug ?? null,
    pid: row.clone?.catalogueSourcePid ?? null,
  }));

  return mapped.sort(compareClaimRows);
}
