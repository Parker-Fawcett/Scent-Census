// Creator accounts: claim-based, never fan pages (PRD section 7.7). This
// module owns the invite token (HMAC-signed, expiring, one-time) and the
// claimed creator's own logging of pickups/reviews. The token is the whole
// invite: an admin script mints it, the creator claims with it; email is
// an env-gated layer on top, never a prerequisite.

import crypto from "node:crypto";
import type { PrismaInstance } from "@/lib/prisma";
import { env } from "@/config";

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // two weeks, invite-sized window

interface TokenPayload {
  creatorId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", env.authSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", env.authSecret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (typeof payload.creatorId !== "string" || typeof payload.expiresAt !== "number") return null;
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export function mintClaimToken(creatorId: string): string {
  return sign({
    creatorId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomUUID(),
  });
}

export async function claimCreator(
  prisma: PrismaInstance,
  userId: string,
  token: string,
): Promise<{ claimed: boolean; creatorSlug: string | null; reason?: string }> {
  const payload = verify(token);
  if (payload === null) {
    return { claimed: false, creatorSlug: null, reason: "invalid or expired token" };
  }
  const creator = await prisma.creator.findUnique({ where: { id: payload.creatorId } });
  if (creator === null) {
    return { claimed: false, creatorSlug: null, reason: "unknown creator" };
  }
  if (creator.status === "CLAIMED" || creator.status === "VERIFIED") {
    // already claimed by someone else: refuse rather than silently reassign
    if (creator.claimedById !== null && creator.claimedById !== userId) {
      return { claimed: false, creatorSlug: creator.slug, reason: "already claimed by another account" };
    }
  }
  await prisma.creator.update({
    where: { id: creator.id },
    data: { claimedById: userId, status: "CLAIMED" },
  });
  return { claimed: true, creatorSlug: creator.slug };
}

export async function verifyCreator(
  prisma: PrismaInstance,
  creatorId: string,
): Promise<void> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (creator === null) throw new Error("creator: unknown creator");
  if (creator.status !== "CLAIMED") {
    throw new Error("creator: only a claimed account can be verified");
  }
  await prisma.creator.update({ where: { id: creatorId }, data: { status: "VERIFIED" } });
}

export async function logCreatorPickup(
  prisma: PrismaInstance,
  userId: string,
  input: { creatorId: string; fragranceId: string; url: string; title?: string; kind?: string },
): Promise<void> {
  const creator = await prisma.creator.findUnique({ where: { id: input.creatorId } });
  if (creator === null || creator.claimedById !== userId) {
    throw new Error("creator: only the claiming account may log pickups");
  }
  if (input.url.trim() === "") throw new Error("creator: a review or pickup url is required");
  const fragrance = await prisma.fragrance.findUnique({ where: { id: input.fragranceId } });
  if (fragrance === null) throw new Error("creator: unknown fragrance");
  await prisma.creatorPickup.create({
    data: {
      creatorId: input.creatorId,
      fragranceId: input.fragranceId,
      url: input.url.trim(),
      title: input.title?.trim() || null,
      kind: input.kind === "pickup" ? "pickup" : "review",
    },
  });
}

export async function listCreatorPickupsForFragrance(
  prisma: PrismaInstance,
  fragranceId: string,
): Promise<Array<{
  id: string;
  title: string | null;
  url: string;
  kind: string;
  creatorName: string;
  creatorSlug: string;
  createdAt: Date;
  // the creator's own verdict, when they said one. This is ONE person's
  // opinion and it is shown separately from the community vote counts, never
  // merged with them.
  creatorVerdictCents: number | null;
  creatorVerdictNote: string | null;
  // whether the creator sent this traffic to us in return for ours
  isPartner: boolean;
}>> {
  const rows = await prisma.creatorPickup.findMany({
    where: { fragranceId },
    orderBy: { createdAt: "desc" },
    include: { creator: { select: { name: true, slug: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    kind: r.kind,
    creatorName: r.creator.name,
    creatorSlug: r.creator.slug,
    createdAt: r.createdAt,
    creatorVerdictCents: r.creatorVerdictCents,
    creatorVerdictNote: r.creatorVerdictNote,
    isPartner: r.partnerId !== null,
  }));
}
