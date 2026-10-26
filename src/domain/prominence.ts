/**
 * Prominence filters for the two different tag lists.
 *
 * The corpus stores, for every scent, a set of accord tags and a set of
 * notes, each with a prominence score from 0 to 100. They are not the same
 * measurement and they must not share a floor.
 *
 * NOTES are a pyramid. A weight of zero means nobody voted that note, not
 * that the note is faint, so a relative floor keeps the materials the
 * community actually smells. The first ingest kept every note, which made
 * Tuscan Leather carry jasmine at zero.
 *
 * ACCORDS are already a short summary: the corpus stores at most eight,
 * ordered by strength, and every one of them is a family the community
 * voted for. A relative floor at 35% was borrowed from the notes and it
 * deleted most of the summary on scents with one dominant family. Louis
 * Vuitton Imagination came out with a single accord, citrus, while the
 * source carries eight (fresh spicy, green, fresh, aromatic, sweet, amber,
 * floral). That is the bug this file now prevents.
 */

export const PROMINENCE_FLOOR = 0.35;

/** A strength has to be a real positive vote to be listed. */
export const ACCORD_STRENGTH_FLOOR = 1;

export interface ProminenceTag {
  name: string;
  strength: number;
}

/**
 * The notes worth listing for a scent, strongest first.
 *
 * Relative: a note has to be at least this much of the strongest note on
 * the same scent. A 35% floor keeps the materials that describe the scent
 * and drops the tail.
 */
export function filterByProminence(
  tags: ProminenceTag[],
  floor: number = PROMINENCE_FLOOR,
): string[] {
  if (tags.length === 0) return [];
  const sorted = [...tags].sort((a, b) => b.strength - a.strength);
  const top = sorted[0].strength;
  if (top <= 0) return sorted.map((t) => t.name);
  return sorted.filter((t) => t.strength >= top * floor).map((t) => t.name);
}

/**
 * The accord families worth listing for a scent, strongest first.
 *
 * Accords are kept whole. They are the scent's family summary, the corpus
 * caps them at eight, and a weak-but-real family (fresh at 26 next to citrus
 * at 100) is still a family the community voted for. Only a zero strength
 * is dropped, because zero means no vote.
 */
export function filterAccords(
  tags: ProminenceTag[],
  floor: number = ACCORD_STRENGTH_FLOOR,
): string[] {
  return [...tags]
    .filter((tag) => tag.name.trim() !== "" && tag.strength >= floor)
    .sort((a, b) => b.strength - a.strength)
    .map((tag) => tag.name);
}
