// Onboarding validation (PRD section 7.1): budget band, clone band, 1-3
// accords. There is no long quiz and no rate-50-fragrances wall; validation
// lives here so every entry point (server action, API, future app) enforces
// the same contract, and every field is skippable without freezing state.

export const BUDGET_BANDS = ["<50", "50-150", "150-400", "no-ceiling"] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

export const CLONE_BANDS = [
  "yes-happily",
  "original-only",
  "only-the-good-ones",
] as const;
export type CloneBand = (typeof CLONE_BANDS)[number];

/** Rendered from notes actually present on the shelf, per PRD 7.1; this list
 * is the no-shelf fallback and the accepted vocabulary at validation time. */
export const FALLBACK_ACCORDS = [
  "fresh",
  "sweet",
  "woody",
  "aromatic",
  "gourmand",
  "amber",
  "floral",
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
