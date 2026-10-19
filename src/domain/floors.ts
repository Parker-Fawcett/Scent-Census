// Numeric floors decided by the PRD and RESEARCH-hard-parts.md. They live in
// exactly one place so recalibration is a reviewable edit, never a magic
// number buried in code.
export const floors = {
  price: {
    /** Minimum fresh listings before an estimate is labeled confident. */
    minSample: 12,
    /** Points older than this are excluded from estimates. */
    staleDays: 30,
  },
  census: {
    /** Votes before a clone enters the ranked list, labeled low confidence. */
    lowConfidenceVotes: 10,
    /** Votes before the low-confidence label drops. */
    confidentVotes: 25,
    /** Score distance within which two clones display as statistically tied. */
    tieBand: 10,
  },
  feed: {
    /** Share of feed cards matched to taste; the rest is deliberate contrast. */
    tasteShare: 0.7,
  },
} as const;
