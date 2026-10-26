// Public clone claims.
//
// The census knows two kinds of number. A measured edge is a vote share: of
// the people who compared two bottles, how many said one reminds them of the
// other. That number only exists when the corpus has votes.
//
// A claim is the other kind. A dupe house says "inspired by Louis Vuitton
// Imagination" on its own product page. That is a fact about the seller, not
// about the scent, and it must never turn into a percentage in the census.
// What we can honestly add is a note match: how much of the original's note
// pyramid the claimed product also publishes. It is reproducible, it is
// checkable by anyone reading both listings, and it says nothing about how
// the bottle smells on skin.
//
// Three numbers, three different questions:
//   closeness  = share of voters who agreed (measured, needs votes)
//   note match = overlap of published note lists (computed, always available)
//   claimed %  = what a blog asserted (quoted, never ours)

export interface NoteWeight {
  name: string;
  weight: number;
}

/**
 * Origin adjectives that Fragrantica attaches to a material but that do not
 * change which material it is. "Calabrian bergamot" and "bergamot" are the
 * same note to a shopper comparing two note lists.
 */
const ORIGIN_WORDS = new Set([
  "calabrian",
  "sicilian",
  "tunisian",
  "nigerian",
  "ceylon",
  "chinese",
  "indian",
  "japanese",
  "thai",
  "indonesian",
  "malaysian",
  "madagascan",
  "madagascar",
  "haitian",
  "turkish",
  "bulgarian",
  "egyptian",
  "australian",
  "brazilian",
  "somali",
  "moroccan",
  "italian",
  "spanish",
  "french",
  "mexican",
  "guatemalan",
  "virginian",
  "american",
  "african",
  "new",
  "caledonian",
]);

/**
 * Materials that different catalogs name differently. Kept small and explicit
 * on purpose: a broad fuzzy match would silently merge cardamom and cinnamon.
 */
const ALIASES: Record<string, string> = {
  "ambrox": "ambroxan",
  "ambroxide": "ambroxan",
  "frankincense": "olibanum",
  "olibanum frankincense": "olibanum",
  "guiaiac wood": "guaiac wood",
  "guajac wood": "guaiac wood",
  "bergamont": "bergamot",
  "black tea": "tea",
  "chinese black tea": "tea",
  "tea leaf": "tea",
  "orange blossom": "neroli",
  "bigarade": "neroli",
};

/** Lowercase, strip accents, drop origin adjectives, resolve known aliases. */
export function canonicalNoteName(raw: string): string {
  const folded = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const words = folded
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "" && !ORIGIN_WORDS.has(word));
  const joined = words.join(" ").trim();
  return ALIASES[joined] ?? joined;
}

export interface CompositionMatch {
  /** harmonic mean of the two coverage directions, 0 to 100 */
  score: number;
  /** how many canonical materials the two lists share */
  shared: number;
  /** how many materials the original lists, after prominence filtering */
  originalCount: number;
  /** how many materials the claim lists */
  claimCount: number;
  /** materials the original lists that the claim does not */
  missing: string[];
}

/**
 * How much of a bottle's published note list a claimed clone reproduces.
 *
 * Both directions matter. A clone house that lists the full pyramid but adds
 * six invented notes is not the same as one that lists only the pyramid. So
 * this is the harmonic mean of recall (how much of the original is covered,
 * weighted by how prominent each note is) and precision (how much of the
 * claim's list is real materials from the original).
 *
 * Weights come from the original's community votes, so the black tea that
 * everyone smells counts more than the frankincense nobody voted for.
 */
export function compositionMatch(
  original: NoteWeight[],
  claimNotes: string[],
): CompositionMatch {
  const originalByCanon = new Map<string, number>();
  for (const note of original) {
    const key = canonicalNoteName(note.name);
    if (key === "") continue;
    // a duplicate name keeps the stronger weight, never the sum
    originalByCanon.set(key, Math.max(originalByCanon.get(key) ?? 0, note.weight));
  }

  const claimByCanon = new Set<string>();
  for (const note of claimNotes) {
    const key = canonicalNoteName(note);
    if (key !== "") claimByCanon.add(key);
  }

  const originalCount = originalByCanon.size;
  const claimCount = claimByCanon.size;
  const sharedKeys = [...originalByCanon.keys()].filter((key) => claimByCanon.has(key));
  const shared = sharedKeys.length;

  if (originalCount === 0 || claimCount === 0) {
    return { score: 0, shared, originalCount, claimCount, missing: [...originalByCanon.keys()] };
  }

  const totalWeight = [...originalByCanon.values()].reduce((sum, w) => sum + w, 0);
  const coveredWeight = sharedKeys.reduce(
    (sum, key) => sum + (originalByCanon.get(key) ?? 0),
    0,
  );

  // a scent whose weights are all zero still has a list, so fall back to counts
  const recall =
    totalWeight > 0 ? coveredWeight / totalWeight : shared / originalCount;
  const precision = shared / claimCount;
  const score = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);

  return {
    // floor, not round: 99.6% of the original's notes is not all of them, and
    // a page that shows 100 for a product missing a note is lying by rounding
    score: Math.min(100, Math.floor(score * 100)),
    shared,
    originalCount,
    claimCount,
    missing: [...originalByCanon.keys()].filter((key) => !claimByCanon.has(key)),
  };
}

/** "from $49 / 60ml", or null when the claim carries no verified price. */
export function formatClaimPrice(
  priceCents: number | null,
  sizeMl: number | null,
  currency: string | null,
): string | null {
  if (priceCents === null || sizeMl === null) return null;
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const amount = (priceCents / 100).toFixed(2).replace(/\.00$/, "");
  return `from ${symbol}${amount} / ${sizeMl}ml`;
}

/**
 * Scent family match: how much of the original's scent families the clone
 * shares. 50% accord cosine (broad family overlap) + 50% note Jaccard
 * (material overlap). This is the closest thing to "how close does it smell"
 * that we can compute from public data. It is not a vote and not a memory
 * test. It is a materials-and-families comparison.
 *
 * Returns 0-100. Returns 0 when either side has no data.
 */
export function scentFamilyMatch(
  targetNotes: string[],
  targetAccords: Record<string, number>,
  cloneNotes: string[],
  cloneAccords: Record<string, number>,
): number {
  // canonicalize note names
  const tNotes = new Set(targetNotes.map(canonicalNoteName).filter(Boolean));
  const cNotes = new Set(cloneNotes.map(canonicalNoteName).filter(Boolean));

  // jaccard on note sets
  const shared = new Set([...tNotes].filter((n) => cNotes.has(n)));
  const union = new Set([...tNotes, ...cNotes]);
  const noteJaccard = union.size > 0 ? shared.size / union.size : 0;

  // accord cosine
  const keys = new Set([...Object.keys(targetAccords), ...Object.keys(cloneAccords)]);
  let dot = 0;
  let magT = 0;
  let magC = 0;
  for (const k of keys) {
    const tv = targetAccords[k] ?? 0;
    const cv = cloneAccords[k] ?? 0;
    dot += tv * cv;
    magT += tv * tv;
    magC += cv * cv;
  }
  const accordCos = magT > 0 && magC > 0 ? dot / (Math.sqrt(magT) * Math.sqrt(magC)) : 0;

  return Math.round((0.5 * accordCos + 0.5 * noteJaccard) * 100);
}

export interface ClaimVoteShare {
  /** share of voters who said it reminds them of the original, 0 to 100 */
  share: number;
  /** total votes cast on the pair */
  total: number;
}

/** A pair leads with its vote share only once the sample clears this floor.
 * Below it the computed scent match stays the headline, because a handful of
 * opinions is not a measurement. */
export const VOTE_LED_MIN = 25;

/**
 * The label for a claim's receipt link, in words a reader can vet before
 * clicking: the domain decides between siblings like a Reddit thread and a
 * catalogue page, and the claim type covers the rest.
 */
export function claimSourceLabel(claimType: string, sourceUrl: string | null): string {
  if (sourceUrl !== null) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
      if (/reddit\.com$/.test(host)) return "Reddit thread";
      if (/fragrantica\.com$/.test(host)) return "Fragrantica";
      if (/parfumo\.de$/.test(host)) return "Parfumo";
    } catch {
      // a malformed URL falls through to the claim-type label below
    }
  }
  switch (claimType) {
    case "HOUSE_DECLARED":
      return "seller page";
    case "COMMUNITY_LIST":
      return "public list";
    case "EDITORIAL":
      return "blog post";
    default:
      return "source";
  }
}

/**
 * The vote share a claim carries when the corpus compared the pair and the
 * pair missed the census floor. Null means nobody has compared it, which is a
 * different fact from a low score.
 */
export function claimVoteShare(claim: {
  measuredUp: number | null;
  measuredDown: number | null;
}): ClaimVoteShare | null {
  const up = claim.measuredUp ?? 0;
  const down = claim.measuredDown ?? 0;
  const total = up + down;
  if (total <= 0) return null;
  return { share: Math.round((up / total) * 100), total };
}

export interface ClaimSortKey {
  familyMatch: number | null;
  measuredUp: number | null;
  measuredDown: number | null;
  noteMatch: number | null;
  priceCents: number | null;
  productName: string;
}

/**
 * Family match is the primary ranking: it measures how close the scent
 * families are, which is the closest thing to "how close does this smell."
 * Then vote share for pairs that were compared. Then price.
 */
export function compareClaimRows(a: ClaimSortKey, b: ClaimSortKey): number {
  if (a.familyMatch !== b.familyMatch) {
    if (a.familyMatch === null) return 1;
    if (b.familyMatch === null) return -1;
    return b.familyMatch - a.familyMatch;
  }
  const aVote = claimVoteShare(a);
  const bVote = claimVoteShare(b);
  if ((aVote !== null) !== (bVote !== null)) return aVote !== null ? -1 : 1;
  if (aVote !== null && bVote !== null) {
    if (aVote.share !== bVote.share) return bVote.share - aVote.share;
    return bVote.total - aVote.total;
  }
  const aPrice = a.priceCents ?? Number.MAX_SAFE_INTEGER;
  const bPrice = b.priceCents ?? Number.MAX_SAFE_INTEGER;
  if (aPrice !== bPrice) return aPrice - bPrice;
  return a.productName.localeCompare(b.productName, "en");
}
