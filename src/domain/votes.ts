// Vote domain (PRD section 7.3): like / dislike / decline / own, with the
// reason line that was showing when the vote was cast, so we learn which
// reasons users actually accept. Pure validation here; persistence is the
// owner-scoped repo (one row per user+fragrance, upsert on revision).

export const VOTE_DIRECTIONS = ["LIKE", "DISLIKE", "DECLINE", "OWN"] as const;
export type VoteDirection = (typeof VOTE_DIRECTIONS)[number];

export const MAX_REASON_SLUG = 64;

export function parseVoteDirection(raw: string | null | undefined): VoteDirection {
  const value = (raw ?? "").trim().toUpperCase();
  if (!(VOTE_DIRECTIONS as readonly string[]).includes(value)) {
    throw new Error(
      `vote: unknown direction "${raw}" (expected one of ${VOTE_DIRECTIONS.join(", ")})`,
    );
  }
  return value as VoteDirection;
}

export interface RawVote {
  direction: string | null | undefined;
  reasonSlug?: string | null;
}

export interface Vote {
  direction: VoteDirection;
  reasonSlug: string | null;
}

export function validateVote(raw: RawVote, context?: { fragranceId?: string }): Vote {
  if (context !== undefined) {
    const fragranceId = context.fragranceId;
    if (typeof fragranceId !== "string" || fragranceId.trim() === "") {
      throw new Error("vote: a vote needs a non-blank fragrance id");
    }
  }
  const direction = parseVoteDirection(raw.direction);
  const reasonSlug = raw.reasonSlug === undefined || raw.reasonSlug === null
    ? null
    : raw.reasonSlug.trim();
  if (reasonSlug === "") {
    throw new Error("vote: a shown reason line must not be blank; omit it instead");
  }
  if (reasonSlug !== null && reasonSlug.length > MAX_REASON_SLUG) {
    throw new Error(
      `vote: reason slug exceeds ${MAX_REASON_SLUG} characters (bogus slug, likely a bug not data)`,
    );
  }
  return { direction, reasonSlug };
}
