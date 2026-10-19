// Feed algorithm weights (PRD section 10): "weights are constants, exposed in
// one config file, and reviewed rations style each phase." Every invented
// number below is a v1 ration to recalibrate with data, not a law of physics.

export const feedWeights = {
  /** Note/aaccord affinity against the taste profile (prefs + shelf accords). */
  wNotes: 0.4,
  /** House-tier fit (clone steering comes from the onboarding clone answer). */
  wHouse: 0.2,
  /** Budget fit with a steep penalty above the band ceiling. */
  wBudget: 0.2,
  /** Inspiration-link graph distance from owned fragrances (clone-of chains). */
  wLinks: 0.2,
  /** Non-w xpositional penalty: disliked-note overlap. */
  pDislike: 0.5,
  /** Non-additive penalty: owned/flanker fatigue (same house as a bottle). */
  pOwned: 0.3,
  /** Deterministic novelty jitter, half-amplitude in each direction. */
  jitter: 0.01,
  /** Ratio of mid estimate to band ceiling that still counts as a value pick. */
  valueFit: 2 / 3,
  /** Estimate-to-ceiling fit ladder for finite ceilings. */
  budgetFit: {
    /** well inside the ceiling */
    value: 1.0,
    /** inside the ceiling */
    nearCeiling: 0.8,
    /** slightly over: steep penalty but not zeroed */
    over: 0.4,
    /** obviously over: zeroed */
    wayOver: 0.0,
    /** no market data: neutral, never a fake number */
    noData: 0.5,
  },
  /** Budget band ceilings in cents (PRD 7.1 bands; null = no ceiling). */
  budgetCeilingCents: {
    "<50": 5000,
    "50-150": 15000,
    "150-400": 40000,
    "no-ceiling": null,
  } as { "<50": number; "50-150": number; "150-400": number; "no-ceiling": number | null },
  /** House-tier fit by clone band: the taste answer steers clones directly. */
  cloneHouseFit: {
    "yes-happily": 1.0,
    "only-the-good-ones": 0.55,
    "original-only": 0.1,
    /** no answer yet: neutral, no steering */
    noAnswer: 0.7,
  },
  /** Non-clone tier fits per clone band (clone houses prefer clone-friendly bands). */
  nonCloneHouseFit: {
    NICHE: 1.0,
    DESIGNER: 0.85,
    MASS_MARKET: 0.7,
  },
  /** Inspiration-graph point value by distance from a shelf fragrance. */
  inspirationDistancePoints: [1.0, 0.6, 0.3],
} as const;
