// Onboarding validation. Setup asks for a bottle, 1-3 accords from the
// census's own family vocabulary, a clone answer and a budget band. There is
// no long quiz and no rate-50-fragrances wall; validation lives here so every
// entry point (server action, API, future app) enforces the same contract,
// and every field is skippable without freezing state.

import { describe, expect, it } from "vitest";
import { validateOnboarding } from "@/domain/onboarding";

describe("validateOnboarding", () => {
  it("accepts every defined budget band", () => {
    for (const band of ["<50", "50-150", "150-400", "no-ceiling"]) {
      expect(validateOnboarding({ budgetBand: band }).budgetBand).toBe(band);
    }
  });

  it("refuses unknown budget bands with the band list in the error", () => {
    expect(() => validateOnboarding({ budgetBand: "$12" })).toThrow(/budget/);
    expect(() => validateOnboarding({ budgetBand: "$12" })).toThrow(/no-ceiling/);
  });

  it("accepts every clone band", () => {
    for (const band of ["yes-happily", "original-only", "only-the-good-ones"]) {
      expect(validateOnboarding({ cloneBand: band }).cloneBand).toBe(band);
    }
  });

  it("refuses free-text clone answers", () => {
    expect(() => validateOnboarding({ cloneBand: "sure why not" })).toThrow(/clones/i);
  });

  it("accepts 1-3 unique accords from the family vocabulary", () => {
    const one = validateOnboarding({ accordPrefs: ["woody"] });
    expect(one.accordPrefs).toEqual(["woody"]);
    const three = validateOnboarding({ accordPrefs: ["citrus", "sweet", "woody"] });
    expect(three.accordPrefs).toEqual(["citrus", "sweet", "woody"]);
    const multiWord = validateOnboarding({ accordPrefs: ["warm spicy"] });
    expect(multiWord.accordPrefs).toEqual(["warm spicy"]);
  });

  it("accepts the families people actually name", () => {
    // the old seven-word list offered "gourmand" (119 fragrances in the
    // catalogue) and none of citrus, powdery, fruity or the spices
    for (const family of ["citrus", "powdery", "fruity", "warm spicy", "white floral"]) {
      expect(() => validateOnboarding({ accordPrefs: [family] })).not.toThrow();
    }
  });

  it("refuses a family the census does not have", () => {
    expect(() => validateOnboarding({ accordPrefs: ["gourmand"] })).toThrow(/accord/i);
  });

  it("refuses zero accords when accords were provided at all", () => {
    expect(() => validateOnboarding({ accordPrefs: [] })).toThrow(/accord/i);
  });

  it("refuses more than three accords", () => {
    expect(() =>
      validateOnboarding({ accordPrefs: ["citrus", "sweet", "woody", "aromatic"] }),
    ).toThrow(/three/i);
  });

  it("refuses unknown accord values and duplicate picks", () => {
    expect(() => validateOnboarding({ accordPrefs: ["floral", "bubbly"] })).toThrow(/accord/i);
    expect(() => validateOnboarding({ accordPrefs: ["floral", "floral"] })).toThrow(/duplicate/i);
  });

  it("empty input is legal: every step is skippable", () => {
    expect(validateOnboarding({})).toEqual({
      budgetBand: null,
      cloneBand: null,
      accordPrefs: [],
    });
  });
});
