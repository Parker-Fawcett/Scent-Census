// Collection repository (PRD section 7.2). Every read/write is scoped to the
// requesting user, and removals fail loud when the id is not theirs, instead
// of silently deleting someone else's bottle or reporting a success that
// changed nothing.

import type { PrismaInstance } from "@/lib/prisma";
import type {
  CollectionItem,
  Fragrance,
  House,
} from "@prisma/client";

export type CollectionRow = CollectionItem & {
  fragrance: Fragrance & { house: House };
};

export interface AddItemInput {
  fragranceId: string;
  sizeMl?: number | null;
  batchCode?: string | null;
  pricePaidCents?: number | null;
  purchasedOn?: Date | null;
  sealed?: boolean;
}

const include = {
  fragrance: { include: { house: true } },
} as const;

export async function addItem(
  prisma: PrismaInstance,
  userId: string,
  input: AddItemInput,
): Promise<CollectionRow> {
  return prisma.collectionItem.create({
    data: {
      userId,
      fragranceId: input.fragranceId,
      sizeMl: input.sizeMl ?? null,
      batchCode: input.batchCode ?? null,
      pricePaidCents: input.pricePaidCents ?? null,
      purchasedOn: input.purchasedOn ?? null,
      sealed: input.sealed ?? false,
    },
    include,
  });
}

export async function listCollection(
  prisma: PrismaInstance,
  userId: string,
): Promise<CollectionRow[]> {
  return prisma.collectionItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include,
  });
}

export async function removeItem(
  prisma: PrismaInstance,
  userId: string,
  itemId: string,
): Promise<void> {
  const deleted = await prisma.collectionItem.deleteMany({
    where: { id: itemId, userId },
  });
  if (deleted.count === 0) {
    throw new Error(
      `collection item ${itemId} not found for user ${userId}; removal is owner-scoped`,
    );
  }
}
