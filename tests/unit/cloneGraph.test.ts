// The clone edge agreement rule. A hard 60% share dropped Marwa, which has
// 883 yes and 695 no against Louis Vuitton Imagination. Those are 1,578
// voters saying the resemblance is real, and the lower bound is what tells
// that apart from a 15-of-25 coin flip.

import { describe, expect, it } from "vitest";
import { passesAgreementFloor, wilsonLowerBound } from "@/domain/cloneGraph";

describe("wilsonLowerBound", () => {
  it("is below the observed share", () => {
    expect(wilsonLowerBound(883, 1578)).toBeLessThan(883 / 1578);
  });

  it("gets tighter as the sample grows", () => {
    expect(wilsonLowerBound(883, 1578)).toBeGreaterThan(
      wilsonLowerBound(56, 100),
    );
  });

  it("returns zero for an empty sample", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
});

describe("passesAgreementFloor", () => {
  it("keeps the old 60% edges without needing a large sample", () => {
    expect(passesAgreementFloor(15, 10)).toBe(true);
  });

  it("keeps a large-sample real majority below 60%", () => {
    expect(passesAgreementFloor(883, 695)).toBe(true);
  });

  it("rejects a small-sample 56% coin flip", () => {
    expect(passesAgreementFloor(14, 11)).toBe(false);
  });

  it("rejects an exact 50/50 even with a large sample", () => {
    expect(passesAgreementFloor(500, 500)).toBe(false);
  });
});
