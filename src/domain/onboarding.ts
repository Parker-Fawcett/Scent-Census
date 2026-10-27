// Onboarding validation.
//
// The questions follow what the product actually is now: a census of how
// close a clone smells to the bottle it copies. So setup asks for four
// things, in order of how much they sharpen the picks:
//
//   1. a bottle you already own (optional, handled by the action: it becomes
//      a shelf row, and the feed reasons from bottles it can name)
//   2. the families you reach for, from the census's real accord vocabulary
//   3. whether you would wear a clone at all
//   4. what you will pay, which tilts the ranking at the value edge of a pair
//
// Validation lives here so every entry point (server action, API, future
// app) enforces the same contract. Every field is skippable without freezing
// state.

export const BUDGET_BANDS = ["<50", "50-150", "150-400", "no-ceiling"] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

export const CLONE_BANDS = [
  "yes-happily",
  "original-only",
  "only-the-good-ones",
] as const;
export type CloneBand = (typeof CLONE_BANDS)[number];

/**
 * The accord chips shown at setup, taken from the census's own family
 * vocabulary and ordered by how many catalogued fragrances carry the
 * accord. The old list was seven hand-picked words, one of which
 * (gourmand) matched 119 fragrances out of 140,228 while the families
 * people actually name (citrus, leather, tobacco, vanilla) were missing.
 *
 * This list is also the accepted vocabulary at validation time. Keep it in
 * sync with the accord families the pages are built from.
 */
export const FALLBACK_ACCORDS = [
  "woody",
  "citrus",
  "sweet",
  "powdery",
  "aromatic",
  "amber",
  "fruity",
  "warm spicy",
  "white floral",
  "fresh spicy",
  "floral",
  "musky",
] as const;
export type AccordPref = (typeof FALLBACK_ACCORDS)[number];

export interface RawOnboarding {
  budgetBand?: string | null;
  cloneBand?: string | null;
  accordPrefs?: string[];
}

export interface ParsedOnboarding {
  budgetBand: BudgetBand | null;
  cloneBand: CloneBand | null;
  accordPrefs: AccordPref[];
}

export function validateOnboarding(raw: RawOnboarding): ParsedOnboarding {
  const budgetBand = raw.budgetBand ?? null;
  if (budgetBand !== null && !(BUDGET_BANDS as readonly string[]).includes(budgetBand)) {
    throw new Error(
      `onboarding: unknown budget band "${budgetBand}" (expected one of ${BUDGET_BANDS.join(", ")})`,
    );
  }
  const cloneBand = raw.cloneBand ?? null;
  if (cloneBand !== null && !(CLONE_BANDS as readonly string[]).includes(cloneBand)) {
    throw new Error(
      `onboarding: unknown clones answer "${cloneBand}" (expected one of ${CLONE_BANDS.join(", ")})`,
    );
  }
  const accordPrefs = raw.accordPrefs ?? [];
  if (accordPrefs.length > 3) {
    throw new Error("onboarding: at most three accords");
  }
  if (new Set(accordPrefs).size !== accordPrefs.length) {
    throw new Error("onboarding: accord picks must not contain duplicates");
  }
  for (const accord of accordPrefs) {
    if (!(FALLBACK_ACCORDS as readonly string[]).includes(accord)) {
      throw new Error(
        `onboarding: unknown accord "${accord}" (expected one of ${FALLBACK_ACCORDS.join(", ")})`,
      );
    }
  }
  if (raw.accordPrefs !== undefined && raw.accordPrefs.length === 0) {
    throw new Error("onboarding: at least one accord when accords are provided");
  }
  return {
    budgetBand: budgetBand as BudgetBand | null,
    cloneBand: cloneBand as CloneBand | null,
    accordPrefs: accordPrefs as AccordPref[],
  };
}
