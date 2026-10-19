// Feed algorithm v1 (PRD sections 7.4 and 10). Pure domain: storage-free
// inputs, deterministic output, explainable score. The 70/30 taste/contrast
// split is a composition quota on candidate nature, and the page order spaces
// contrast cards while avoiding same-reason neighbors. Correctness rules beat
// quotas: when a pool is short the feed shows fewer cards, never filler.

import { type BudgetBand, type CloneBand } from "./onboarding";
import { floors } from "./floors";
import { type HouseTier } from "./types";
import { type VoteDirection } from "./votes";
import { feedWeights } from "./feedWeights";

export interface FeedCandidateHouse {
  id: string;
  name: string;
  slug: string;
  tier: HouseTier;
}

export interface FeedCandidate {
  fragranceId: string;
  name: string;
  house: FeedCandidateHouse;
  accordNames: string[];
  noteNames: string[];
  inspiredById: string | null;
  estimateCentsLow: number | null;
  estimateCentsHigh: number | null;
}

export interface FeedShelfItem {
  fragranceId: string;
  name: string;
  accordNames: string[];
  // optional: owned-house fatigue only applies when it is known
  houseId?: string;
}

/**
 * A non-LIKE vote (PRD 7.3): owns/dislikes/declines never return to the feed,
 * and their note footprint is the rejected-look penalty surface.
 */
export interface FeedRejected {
  fragranceId: string;
  direction: Exclude<VoteDirection, "LIKE">;
  accordNames: string[];
}

export interface FeedProfile {
  budgetBand: BudgetBand | null;
  cloneBand: CloneBand | null;
  accordPrefs: string[];
}

export interface FeedInputs {
  profile: FeedProfile;
  shelf: FeedShelfItem[];
  rejected: FeedRejected[];
  /** fragranceId -> inspiredById for candidates and shelf members */
  inspiredBy: Map<string, string | null>;
  /** fragranceId -> reason slug it showed on the immediately earlier page
   * (PRD 7.3: no fragrance back-to-back with the same reason). */
  shownRecently: Map<string, string>;
  /** Deterministic per-user seed (makeJitterSeed of the user id). */
  seed: number;
  pageSize: number;
}

export interface ScoreAddend {
  name: string;
  points: number;
  why: string;
}

export interface ScoreBreakdown {
  score: number;
  addends: ScoreAddend[];
}

export type FeedSlot = "taste" | "contrast";

export interface FeedCard {
  candidate: FeedCandidate;
  slot: FeedSlot;
  score: number;
  reasonSlug: string;
  reasonLine: string;
}

export interface PagedFeed {
  cards: FeedCard[];
}

export function makeJitterSeed(userId: string): number {
  // FNV-1a: a stable small derived seed per user, reused page after page.
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stableHash(seed: number, fragId: string): number {
  // fold the fragment id into a [0, 1) fraction seeded by the user
  let hash = seed;
  for (let i = 0; i < fragId.length; i++) {
    hash ^= fragId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function overlapRatio(sample: string[], against: string[]): number {
  if (sample.length === 0 || against.length === 0) return 0;
  const set = new Set(against.map((x) => x.toLowerCase()));
  let matched = 0;
  for (const one of sample) {
    if (set.has(one.toLowerCase())) matched++;
  }
  return matched / sample.length;
}

function budgetCeilingCents(band: BudgetBand | null): number | null {
  if (band === null) return null;
  return feedWeights.budgetCeilingCents[band] ?? null;
}

export function feedScore(candidate: FeedCandidate, inputs: FeedInputs): ScoreBreakdown {
  const w = feedWeights;
  const addends: ScoreAddend[] = [];

  // 1. note/aaccord affinity: taste base is prefs plus what is already shelved
  const base = [
    ...inputs.profile.accordPrefs,
    ...inputs.shelf.flatMap((b) => b.accordNames),
  ];
  const affinity = overlapRatio(candidate.accordNames, base);
  addends.push({
    name: "notes_affinity",
    points: w.wNotes * affinity,
    why:
      affinity > 0
        ? `shares ${Math.round(affinity * 100)}% of your accord set`
        : "no accord overlap with your profile or shelf",
  });

  // 2. house-tier fit steered by the clone-band answer
  const cloneFit =
    candidate.house.tier === "CLONE"
      ? (() => {
          switch (inputs.profile.cloneBand) {
            case "yes-happily":
              return w.cloneHouseFit["yes-happily"];
            case "only-the-good-ones":
              return w.cloneHouseFit["only-the-good-ones"];
            case "original-only":
              return w.cloneHouseFit["original-only"];
            default:
              return w.cloneHouseFit.noAnswer;
          }
        })()
      : w.nonCloneHouseFit[candidate.house.tier];
  addends.push({
    name: "house_tier_fit",
    points: w.wHouse * cloneFit,
    why:
      candidate.house.tier === "CLONE"
        ? `clone tier with the clone answer "${inputs.profile.cloneBand ?? "unanswered"}"`
        : `${candidate.house.tier.toLowerCase()} tier`,
  });

  // 3. budget fit (steep above the ceiling, neutral without data)
  const ceiling = budgetCeilingCents(inputs.profile.budgetBand);
  const estimate =
    candidate.estimateCentsLow !== null && candidate.estimateCentsHigh !== null
      ? (candidate.estimateCentsLow + candidate.estimateCentsHigh) / 2
      : null;
  let budgetFit = w.budgetFit.noData;
  let budgetWhy = "no confident estimate to judge budget against";
  if (estimate !== null && ceiling !== null) {
    const ratio = estimate / ceiling;
    if (ratio <= w.valueFit) {
      budgetFit = w.budgetFit.value;
      budgetWhy = "well inside the budget ceiling";
    } else if (ratio <= 1) {
      budgetFit = w.budgetFit.nearCeiling;
      budgetWhy = "inside the ceiling, near the top of it";
    } else if (ratio <= 2) {
      budgetFit = w.budgetFit.over;
      budgetWhy = "above the budget ceiling";
    } else {
      budgetFit = w.budgetFit.wayOver;
      budgetWhy = "way over the budget ceiling";
    }
  } else if (estimate !== null && ceiling === null) {
    budgetFit = w.budgetFit.value;
    budgetWhy = "no ceilings: any estimate fits";
  }
  addends.push({
    name: "budget_fit",
    points: w.wBudget * budgetFit,
    why: budgetWhy,
  });

  // 4. inspiration-link distance from the shelf (clone-of chains)
  const shelfIds = new Set(inputs.shelf.map((b) => b.fragranceId));
  const distances: number[] = [];
  for (const shelfId of shelfIds) {
    const distance = linkDistance(candidate.fragranceId, shelfId, inputs.inspiredBy);
    if (distance !== null) distances.push(distance);
  }
  let linkPoints = 0;
  if (distances.length > 0) {
    const best = Math.min(...distances);
    linkPoints = w.inspirationDistancePoints[best - 1] ?? w.wLinks;
  }
  addends.push({
    name: "inspiration_link",
    points: w.wLinks * linkPoints,
    why: distances.length > 0 ? `distance-${Math.min(...distances)} link into the shelf` : "no clone-of chain into the shelf",
  });

  // 5. dislike penalty: rejected fragrance accord overlap
  const rejectedAccords = inputs.rejected.flatMap((r) => r.accordNames);
  const rejectedPenalty = overlapRatio(candidate.accordNames, rejectedAccords);
  addends.push({
    name: "dislike_penalty",
    points: -w.pDislike * rejectedPenalty,
    why:
      rejectedPenalty > 0
        ? `overlaps ${Math.round(rejectedPenalty * 100)}% of disliked note space`
        : "no overlap with the disliked pool",
  });

  // 6. owned/flanker fatigue: same house as an owned bottle
  const ownedHouseIds = inputs.shelf.flatMap((b) => (b.houseId ? [b.houseId] : []));
  const ownedSameHouse = ownedHouseIds.includes(candidate.house.id);
  addends.push({
    name: "owned_fatigue",
    points: -w.pOwned * (ownedSameHouse ? 1 : 0),
    why: ownedSameHouse ? "same house as a bottle on your shelf" : "not a shelf-house flanker",
  });

  // 7. deterministic novelty jitter (same input, same output, seeded per user)
  const fraction = stableHash(inputs.seed, candidate.fragranceId);
  const jitterPoints = (fraction - 0.5) * 2 * w.jitter;
  addends.push({
    name: "novelty_jitter",
    points: jitterPoints,
    why: "seeded variety nudge",
  });

  const score = clamp01(addends.reduce((s, x) => s + x.points, 0));
  return { score, addends };
}

/** BFS walk of inspired-by edges: candidate -> ... -> shelfId. Returns 1-based
 * hop count (1 = direct clone of a shelf bottle), null when unlinked. */
function linkDistance(
  candidateId: string,
  shelfId: string,
  inspiredBy: Map<string, string | null>,
): number | null {
  const MAX_DEPTH = feedWeights.inspirationDistancePoints.length;
  let current: string | null = candidateId;
  for (let hops = 1; hops <= MAX_DEPTH; hops++) {
    current = inspiredBy.get(current) ?? null;
    if (current === null) return null;
    if (current === shelfId) return hops;
  }
  return null;
}

export interface Reason {
  slug: string;
  line: string;
}

function accordListNames(accords: string[]): string {
  const trimmed = accords.map((a) => a.toLowerCase()).filter((a) => a !== "");
  if (trimmed.length === 0) return "";
  if (trimmed.length === 1) return trimmed[0];
  return `${trimmed.slice(0, -1).join(", ")} and ${trimmed[trimmed.length - 1]}`;
}

/**
 * The mandatory reason line (PRD 7.1: the reason must reference the bottle or
 * its notes when the shelf is known). Priority: the shelf, the inspiration
 * chain, the onboarding accords, price value, house tier, catalogue fallback.
 * Contrast slots override with the framing "different from your shelf".
 */
export function reasonFor(
  candidate: FeedCandidate,
  inputs: FeedInputs,
  slot: FeedSlot = "taste",
): Reason {
  // 1. shelf accord match: reference the bottle by name
  const shelfMatch = inputs.shelf.find((b) =>
    b.accordNames.some((accord) =>
      candidate.accordNames.map((x) => x.toLowerCase()).includes(accord.toLowerCase()),
    ),
  );
  if (shelfMatch !== undefined) {
    return {
      slug: "accord:shelf-match",
      line: `Like ${shelfMatch.name}, which shares the accords you actually own.`,
    };
  }

  // 2. inspiration chain into the shelf
  for (const shelfId of inputs.shelf) {
    const distance = linkDistance(candidate.fragranceId, shelfId.fragranceId, inputs.inspiredBy);
    if (distance !== null) {
      return {
        slug: `link:clone-of-shelf-${distance}`,
        line: `From the family of ${shelfMatchName(shelfId.fragranceId, inputs.shelf)}.`,
      };
    }
  }

  // 3. onboarding accord match
  const prefsOverlap = candidate.accordNames.filter((accord) =>
    inputs.profile.accordPrefs
      .map((x) => x.toLowerCase())
      .includes(accord.toLowerCase()),
  );
  if (prefsOverlap.length > 0) {
    return {
      slug: "accord:profile-match",
      line: `Matches your taste for ${accordListNames(prefsOverlap)} accords.`,
    };
  }

  // contrast framing kicks in for the deliberate-contrast slot
  if (slot === "contrast") {
    return {
      slug: "contrast:one-family-away",
      line: "Different from your shelf, on purpose.",
    };
  }

  // 4. value pick inside the band
  const ceiling = budgetCeilingCents(inputs.profile.budgetBand);
  if (
    candidate.estimateCentsLow !== null &&
    candidate.estimateCentsHigh !== null &&
    ceiling !== null
  ) {
    const mid = (candidate.estimateCentsLow + candidate.estimateCentsHigh) / 2;
    if (mid <= ceiling * feedWeights.valueFit) {
      return {
        slug: "value:within-budget",
        line: `Well inside your budget at about ${dollars(candidate.estimateCentsLow)} to ${dollars(candidate.estimateCentsHigh)}.`,
      };
    }
  }

  // 5. house tier fallback
  if (candidate.house.tier === "CLONE") {
    return { slug: "house:clone-tier", line: "A clone-house pick, in case you're open to it." };
  }
  return {
    slug: `house:${candidate.house.tier.toLowerCase()}`,
    line: `A ${candidate.house.tier.toLowerCase()} pick worth a look.`,
  };
}

function shelfMatchName(fragId: string, shelf: FeedShelfItem[]): string {
  const item = shelf.find((b) => b.fragranceId === fragId);
  return item?.name ?? "a bottle on your shelf";
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * Build one feed page. Pools are classified by candidate nature (taste-able or
 * contrast), each filled up to its PRD 7.4 share; positions interleave so
 * contrast cards are spaced, and neighbors never share a reason slug. When a
 * pool runs short the page is simply shorter, never filled with filler.
 */
export function buildFeed(candidates: FeedCandidate[], inputs: FeedInputs): PagedFeed {
  const tasteTarget = Math.ceil(inputs.pageSize * floors.feed.tasteShare);
  const contrastTarget = inputs.pageSize - tasteTarget;

  // exclusion first (PRD 7.4: owned, disliked, declined, own never repeat)
  const shelfIds = new Set(inputs.shelf.map((b) => b.fragranceId));
  const rejectedIds = new Set(inputs.rejected.map((r) => r.fragranceId));

  const scored = candidates
    .filter((c) => !shelfIds.has(c.fragranceId) && !rejectedIds.has(c.fragranceId))
    .map((c) => ({ candidate: c, breakdown: feedScore(c, inputs) }))
    .filter((s) => {
      // same fragrance, same reason, back-to-back pages: PRD 7.3 forbids it.
      // A different reason may come back later.
      const shown = inputs.shownRecently.get(s.candidate.fragranceId);
      if (shown === undefined) return true;
      return reasonFor(s.candidate, inputs, "taste").slug !== shown;
    });

  const base = [
    ...inputs.profile.accordPrefs,
    ...inputs.shelf.flatMap((b) => b.accordNames),
  ];
  const rejectedAccords = inputs.rejected.flatMap((r) => r.accordNames);
  const linkedIntoShelf = (id: string): boolean =>
    inputs.shelf.some((s) => linkDistance(id, s.fragranceId, inputs.inspiredBy) !== null);

  const queues: Record<FeedSlot, Array<{ candidate: FeedCandidate; breakdown: ScoreBreakdown }>> = {
    taste: scored
      .filter(
        (s) =>
          overlapRatio(s.candidate.accordNames, base) > 0 ||
          linkedIntoShelf(s.candidate.fragranceId),
      )
      .sort(byScore),
    contrast: scored
      .filter(
        (s) =>
          overlapRatio(s.candidate.accordNames, base) === 0 &&
          overlapRatio(s.candidate.accordNames, rejectedAccords) === 0 &&
          !linkedIntoShelf(s.candidate.fragranceId),
      )
      .sort(byScore),
  };

  // Contrast holds are spaced positions; when the contrast pool is shyer than
  // its share, only the front holds are contrast and the rest stay taste.
  const contrastPositions = new Set(
    contrastPositionsFor(Math.min(contrastTarget, queues.contrast.length), inputs.pageSize),
  );

  const cards: FeedCard[] = [];
  let lastSlug: string | null = null;

  for (let position = 0; position < inputs.pageSize; position++) {
    const desired: FeedSlot = contrastPositions.has(position) ? "contrast" : "taste";
    const picked = takeFrom(queues, desired, lastSlug, inputs);
    if (picked === null) break; // both pools dry: the page is just shorter

    cards.push({
      candidate: picked.entry.candidate,
      slot: picked.pool,
      score: picked.entry.breakdown.score,
      reasonSlug: picked.reason.slug,
      reasonLine: picked.reason.line,
    });
    lastSlug = picked.reason.slug;
  }

  return { cards };
}

/** Take the best candidate from the desired pool whose reason differs from the
 * neighbor's; when everything would repeat, fall back to the other pool, and
 * only then to the same reason (correctness beats variety; quotas beat both). */
function takeFrom(
  queues: Record<FeedSlot, Array<{ candidate: FeedCandidate; breakdown: ScoreBreakdown }>>,
  desired: FeedSlot,
  lastSlug: string | null,
  inputs: FeedInputs,
): { entry: { candidate: FeedCandidate; breakdown: ScoreBreakdown }; pool: FeedSlot; reason: Reason } | null {
  const order: FeedSlot[] = desired === "contrast" ? ["contrast", "taste"] : ["taste", "contrast"];
  for (const pool of order) {
    const queue = queues[pool];
    if (queue.length === 0) continue;
    const reasonSlot = pool;
    const differing = queue.findIndex(
      (s) => reasonFor(s.candidate, inputs, reasonSlot).slug !== lastSlug,
    );
    const taken = queue.splice(differing === -1 ? 0 : differing, 1)[0];
    return {
      entry: taken,
      pool,
      reason: reasonFor(taken.candidate, inputs, reasonSlot),
    };
  }
  return null;
}

/** Spread contrast slot hold positions evenly through the page. */
function contrastPositionsFor(count: number, pageSize: number): number[] {
  if (count <= 0 || pageSize <= 0) return [];
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const position = Math.round(((i + 1) * (pageSize + 1)) / (count + 1)) - 1;
    positions.push(Math.min(pageSize - 1, Math.max(0, position)));
  }
  return [...new Set(positions)]; // dedupe tiny pages
}

function byScore(
  a: { breakdown: ScoreBreakdown; candidate: FeedCandidate },
  b: { breakdown: ScoreBreakdown; candidate: FeedCandidate },
): number {
  if (b.breakdown.score !== a.breakdown.score) {
    return b.breakdown.score - a.breakdown.score;
  }
  return a.candidate.fragranceId.localeCompare(b.candidate.fragranceId);
}
