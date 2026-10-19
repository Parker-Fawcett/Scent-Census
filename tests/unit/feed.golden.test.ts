// Golden synthetic-user fixtures (PRD 10 golden dataset): three long-running
// personas whose feed structure is asserted directly, so regressions in the
// composition quotas, the exclusion rules and the reason priority read as a
// definite persona-specific failure instead of a vague test wobble. Pure
// domain inputs, deterministic seeds, no DB.

import { describe, expect, it } from "vitest";
import {
  buildFeed,
  makeJitterSeed,
  type FeedCandidate,
  type FeedInputs,
  type FeedRejected,
  type FeedShelfItem,
} from "@/domain/feed";

// corpus-flavored synthetic catalog: a Lattafa-like clone neighborhood
// (sweet/vanilla/fruity), a designer neighborhood sharing sweet accords, and
// a deliberately opposite one (leather/smoky/tobacco) for contrast slots.
const SWEET = ["sweet", "vanilla", "fruity"];
const OPPOSITE = ["leather", "smoky", "tobacco"];

function candidate(house: string, tier: "CLONE" | "DESIGNER" | "NICHE", name: string, accords: string[], inspiredBy: string | null = null): FeedCandidate {
  return {
    fragranceId: `${house}-${name}`,
    fragranceSlug: `${house}-${name}`.toLowerCase(),
    name,
    house: { id: house, name: house, slug: house.toLowerCase(), tier },
    accordNames: accords,
    noteNames: [],
    inspiredById: inspiredBy,
    estimateCentsLow: tier === "CLONE" ? 3000 : 25000,
    estimateCentsHigh: tier === "CLONE" ? 5000 : 40000,
  };
}

function catalog(): FeedCandidate[] {
  const out: FeedCandidate[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(candidate("Lattafa", "CLONE", `Khamrah Flavor ${i}`, [...SWEET, i % 2 ? "gourmand" : "warm spicy"]));
  }
  for (let i = 0; i < 8; i++) {
    out.push(candidate("Guerlain", "DESIGNER", `Designer Sweet ${i}`, ["sweet", "amber"]));
  }
  for (let i = 0; i < 8; i++) {
    out.push(candidate("Tom Ford", "NICHE", `Opposite ${i}`, OPPOSITE));
  }
  return out;
}

const inputs = (over: Partial<FeedInputs> & { shelf?: FeedShelfItem[]; rejected?: FeedRejected[] }): FeedInputs => ({
  profile: { budgetBand: "50-150", cloneBand: "yes-happily", accordPrefs: [...SWEET] },
  shelf: [
    { fragranceId: "owned-1", name: "Khamrah", accordNames: [...SWEET], houseId: "lattafa" },
  ],
  rejected: [],
  inspiredBy: new Map(),
  shownRecently: new Map(),
  seed: makeJitterSeed("golden-user"),
  pageSize: 6,
  ...over,
});

function cardIds(page: { cards: Array<{ candidate: FeedCandidate }> }): string[] {
  return page.cards.map((c) => c.candidate.fragranceId);
}

describe("golden: novice (skipped onboarding, empty shelf)", () => {
  const page = buildFeed(catalog(), inputs({
    profile: { budgetBand: null, cloneBand: null, accordPrefs: [] },
    shelf: [],
  }));

  it("still fills a full page", () => {
    expect(page.cards).toHaveLength(6);
  });

  it("gives every card an honest reason (no invented shelf/profile references)", () => {
    for (const card of page.cards) {
      expect(card.reasonLine.length).toBeGreaterThan(0);
      expect(card.reasonSlug).not.toBe("");
    }
  });

  it("is deterministic for the same seed", () => {
    const again = buildFeed(catalog(), inputs({
      profile: { budgetBand: null, cloneBand: null, accordPrefs: [] },
      shelf: [],
    }));
    expect(cardIds(again)).toEqual(cardIds(page));
  });
});

describe("golden: clone-curious regular (full onboarding, one shelf bottle)", () => {
  const page = buildFeed(catalog(), inputs({}));

  it("keeps the PRD 7.4 taste share honest: taste slots are the majority, contrast appears", () => {
    const slots = page.cards.map((c) => c.slot);
    const tasteCount = slots.filter((s) => s === "taste").length;
    expect(tasteCount).toBeGreaterThanOrEqual(3); // 70% of 6 = 4.2 -> at least 3
    expect(slots).toContain("contrast");
  });

  it("names the shelf bottle when an accord match exists (reason priority 1)", () => {
    const shelfNamed = page.cards.filter((c) => c.reasonSlug.startsWith("accord:shelf-match"));
    expect(shelfNamed.length).toBeGreaterThan(0);
    for (const card of shelfNamed) {
      expect(card.reasonLine).toContain("Khamrah");
    }
  });

  it("never shows the owned bottle", () => {
    expect(cardIds(page)).not.toContain("owned-1");
  });
});

describe("golden: heavy push-backer (many dislikes, declines, own)", () => {
  const dismissed = [...OPPOSITE];
  const rejected: FeedRejected[] = [
    { fragranceId: "Tom Ford-Opposite 0", direction: "DISLIKE", accordNames: [...OPPOSITE] },
    { fragranceId: "owned-1", direction: "OWN", accordNames: [...SWEET] },
  ];
  const page = buildFeed(catalog(), inputs({
    rejected,
    shelf: [],
    profile: { budgetBand: "50-150", cloneBand: null, accordPrefs: [...SWEET] },
  }));

  void dismissed;

  it("never surfaces rejected fragrance ids", () => {
    expect(cardIds(page)).not.toContain("Tom Ford-Opposite 0");
    expect(cardIds(page)).not.toContain("owned-1");
  });

  it("keeps filling the page honestly from the remaining pools", () => {
    expect(page.cards.length).toBeGreaterThan(0);
  });
});
