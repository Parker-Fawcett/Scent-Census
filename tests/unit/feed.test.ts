// Feed algorithm v1 (PRD section 10): a deterministic, explainable fit score;
// the 70/30 taste/contrast composition (PRD 7.4); and mandatory reason lines
// (PRD 7.1 acceptance). These tests run on synthetic catalogue shapes, never
// live data, and the golden-user fixtures build on their vocabulary.

import { describe, expect, it } from "vitest";
import {
  buildFeed,
  feedScore,
  makeJitterSeed,
  reasonFor,
  type FeedCandidate,
  type FeedInputs,
  type FeedShelfItem,
} from "@/domain/feed";

const WOODY = "woody";
const GOURMAND = "gourmand";
const FRESH = "fresh";
const AMBER = "amber";

const HOUSE_DESIGNER = {
  id: "house-dior",
  name: "Dior",
  slug: "house-dior",
  tier: "DESIGNER",
} as const;
const HOUSE_CLONE = {
  id: "house-dossier",
  name: "Dossier",
  slug: "house-dossier",
  tier: "CLONE",
} as const;

function candidate(id: string, overrides?: Partial<FeedCandidate>): FeedCandidate {
  return {
    fragranceId: id,
    name: `Cand-${id}`,
    house: HOUSE_DESIGNER,
    accordNames: [FRESH],
    noteNames: ["bergamot"],
    inspiredById: null,
    estimateCentsLow: null,
    estimateCentsHigh: null,
    ...overrides,
  };
}

const NO_SHELF: FeedShelfItem[] = [];

function inputs(overrides?: {
  accordPrefs?: string[];
  budgetBand?: "<50" | "50-150" | "150-400" | "no-ceiling";
  cloneBand?: "yes-happily" | "original-only" | "only-the-good-ones";
  shelf?: FeedShelfItem[];
  rejected?: Array<{
    fragranceId: string;
    direction: "DISLIKE" | "DECLINE" | "OWN";
    accordNames: string[];
  }>;
  inspiredBy?: Record<string, string | null>;
  seed?: number;
  pageSize?: number;
  shownRecently?: Record<string, string>;
}): FeedInputs {
  return {
    profile: {
      budgetBand: overrides?.budgetBand ?? "<50",
      cloneBand: overrides?.cloneBand ?? "only-the-good-ones",
      accordPrefs: overrides?.accordPrefs ?? [WOODY, GOURMAND],
    },
    shelf: overrides?.shelf ?? NO_SHELF,
    rejected: overrides?.rejected ?? [],
    inspiredBy: new Map(Object.entries(overrides?.inspiredBy ?? {})),
    shownRecently: new Map(Object.entries(overrides?.shownRecently ?? {})),
    seed: overrides?.seed ?? makeJitterSeed("user-1"),
    pageSize: overrides?.pageSize ?? 10,
  };
}

describe("feedScore: the fit score is deterministic and explainable", () => {
  it("a candidate matching accord prefs outranks an unrelated candidate", () => {
    const shared = candidate("a", { accordNames: [WOODY, AMBER] });
    const unrelated = candidate("b", { accordNames: [FRESH] });
    const one = inputs();
    expect(feedScore(shared, one).score).toBeGreaterThan(feedScore(unrelated, one).score);
  });

  it("scoring is stable: identical inputs produce an identical score", () => {
    const a = candidate("a", { accordNames: [WOODY] });
    expect(feedScore(a, inputs()).score).toBe(feedScore(a, inputs()).score);
  });

  it("a disliked look-alike drops below an unrelated candidate (PRD 7.3)", () => {
    const overlap = candidate("overlap", { accordNames: [WOODY] });
    const clean = candidate("clean", { accordNames: [FRESH] });
    const one = inputs({
      rejected: [{ fragranceId: "gone", direction: "DISLIKE", accordNames: [WOODY, GOURMAND] }],
    });
    expect(feedScore(overlap, one).score).toBeLessThan(feedScore(clean, one).score);
  });

  it("budget steers ranking: in-budget beats near-ceiling beats over-budget on equal accords", () => {
    const cheap = candidate("cheap", {
      accordNames: [WOODY],
      estimateCentsLow: 2000,
      estimateCentsHigh: 3500,
    });
    const mid = candidate("mid", {
      accordNames: [WOODY],
      estimateCentsLow: 6500,
      estimateCentsHigh: 8500,
    });
    const over = candidate("over", {
      accordNames: [WOODY],
      estimateCentsLow: 18000,
      estimateCentsHigh: 25000,
    });
    const one = inputs(); // budgetBand <50
    const s = {
      cheap: feedScore(cheap, one).score,
      mid: feedScore(mid, one).score,
      over: feedScore(over, one).score,
    };
    expect(s.cheap).toBeGreaterThan(s.mid);
    expect(s.mid).toBeGreaterThan(s.over);
  });

  it("a clone-house candidate is steered by the clone-band answer (taste answer decides)", () => {
    const cloneScent = candidate("clone-scent", { house: HOUSE_CLONE, accordNames: [WOODY] });
    const designerScent = candidate("designer-scent", { accordNames: [WOODY] });
    const deters = inputs({ cloneBand: "original-only" });
    const invites = inputs({ cloneBand: "yes-happily" });
    expect(feedScore(cloneScent, deters).score).toBeLessThan(
      feedScore(designerScent, deters).score,
    );
    expect(feedScore(cloneScent, invites).score).toBeGreaterThan(
      feedScore(designerScent, invites).score,
    );
  });

  it("an inspiration link to a shelf fragrance is a signal (clone-of chains count)", () => {
    const clone = candidate("clone", {
      accordNames: [WOODY],
      inspiredById: "shelf-item",
    });
    const noLink = candidate("none", { accordNames: [WOODY] });
    const one = inputs({
      shelf: [{ fragranceId: "shelf-item", name: "Orpheon", accordNames: [WOODY] }],
      inspiredBy: { "shelf-item": null, clone: "shelf-item", none: null },
    });
    expect(feedScore(clone, one).score).toBeGreaterThan(feedScore(noLink, one).score);
  });

  it("score stays inside [0, 1] even stacked against dislike, budget and fresh accords", () => {
    const worst = candidate("worst", {
      accordNames: [FRESH],
      noteNames: ["sea salt"],
      estimateCentsLow: 50000,
      estimateCentsHigh: 60000,
    });
    const one = inputs({
      rejected: [{ fragranceId: "worst", direction: "DISLIKE", accordNames: [FRESH] }],
    });
    const score = feedScore(worst, one).score;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("every score carries named addends that sum to the total (explainability is hard data)", () => {
    const breakdown = feedScore(candidate("a", { accordNames: [WOODY] }), inputs());
    expect(breakdown.addends.length).toBeGreaterThanOrEqual(5);
    for (const addend of breakdown.addends) {
      expect(addend.name).toMatch(/^[a-z_A-Z]+$/);
      expect(Number.isFinite(addend.points)).toBe(true);
      expect(addend.why.length).toBeGreaterThan(0);
    }
    const total = breakdown.addends.reduce((s, x) => s + x.points, 0);
    expect(total).toBeCloseTo(breakdown.score, 9);
  });
});

describe("buildFeed: composition (PRD 7.4)", () => {
  function tasteSheet(): FeedCandidate[] {
    // seven on-taste candidates with varied price stories (so nearby cards
    // naturally show different reasons) and three off-taste ones
    const estimates: Array<[number | null, number | null]> = [
      [2000, 3500],
      [6500, 8500],
      [2000, 3500],
      [6500, 8500],
      [2000, 3500],
      [6500, 8500],
      [2000, 3500],
    ];
    const onTaste = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"].map((id, i) =>
      candidate(id, {
        accordNames: [WOODY],
        estimateCentsLow: estimates[i][0],
        estimateCentsHigh: estimates[i][1],
      }),
    );
    return [...onTaste, candidate("c1", { accordNames: [FRESH] }), candidate("c2", { accordNames: [FRESH] }), candidate("c3", { accordNames: [FRESH] })];
  }

  it("the first page splits 70% taste / 30% deliberate contrast", () => {
    const feed = buildFeed(tasteSheet(), inputs({ pageSize: 10 }));
    const taste = feed.cards.filter((c) => c.slot === "taste").length;
    const contrast = feed.cards.filter((c) => c.slot === "contrast").length;
    expect(feed.cards.length).toBe(10);
    expect(taste).toBe(7);
    expect(contrast).toBe(3);
  });

  it("never includes fragrances the user owns, disliked, declined, or marked own", () => {
    const safe = candidate("safe", { accordNames: [WOODY] });
    const feed = buildFeed(
      [
        candidate("owned", { accordNames: [WOODY] }),
        candidate("disliked", { accordNames: [WOODY] }),
        candidate("declined", { accordNames: [WOODY] }),
        candidate("owns", { accordNames: [WOODY] }),
        safe,
      ],
      inputs({
        shelf: [{ fragranceId: "owned", name: "Owned", accordNames: [AMBER] }],
        rejected: [
          { fragranceId: "disliked", direction: "DISLIKE", accordNames: [AMBER] },
          { fragranceId: "declined", direction: "DECLINE", accordNames: [AMBER] },
          { fragranceId: "owns", direction: "OWN", accordNames: [AMBER] },
        ],
      }),
    );
    const ids = feed.cards.map((c) => c.candidate.fragranceId);
    expect(ids).toEqual(["safe"]);
  });

  it("contrast cards are really one family away: zero overlap with prefs and shelf accords", () => {
    const feed = buildFeed(tasteSheet(), inputs({ pageSize: 10 }));
    const contrastCards = feed.cards.filter((c) => c.slot === "contrast");
    expect(contrastCards.length).toBe(3);
    for (const card of contrastCards) {
      expect(card.candidate.fragranceId).toMatch(/^c[123]$/);
      expect(card.reasonSlug).toBe("contrast:one-family-away");
      expect(card.reasonLine.toLowerCase()).toContain("different from your shelf");
    }
  });

  it("without any off-shelf candidates the feed drops contrast, never strains", () => {
    const onTaste = ["t1", "t2", "t3"].map((id) => candidate(id, { accordNames: [WOODY] }));
    const feed = buildFeed(onTaste, inputs({ pageSize: 10 }));
    expect(feed.cards.every((c) => c.slot === "taste")).toBe(true);
  });

  it("the page never shows the same fragrance twice", () => {
    const sheet = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((id) =>
      candidate(id, { accordNames: [WOODY] }),
    );
    const feed = buildFeed(sheet, inputs({ pageSize: 10 }));
    const ids = feed.cards.map((c) => c.candidate.fragranceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a fragrance shown on the previous page with a reason is not back-to-back with that same reason", () => {
    // the PRD 7.3 rule is per fragrance: it may return on later pages, but
    // never re-appearing with the same reason line it just showed
    const sheet = ["a", "b", "c"].map((id) =>
      candidate(id, { accordNames: [WOODY], estimateCentsLow: 1500, estimateCentsHigh: 2500 }),
    );
    const feed = buildFeed(sheet, inputs({ pageSize: 3 }));
    expect(feed.cards.length).toBe(3);
    const page2 = buildFeed(
      sheet,
      inputs({ pageSize: 3, shownRecently: { a: "accord:profile-match" } }),
    );
    const againA = page2.cards.find((c) => c.candidate.fragranceId === "a");
    expect(againA).toBeUndefined();
  });
});

describe("reason lines (PRD 7.1 acceptance: a shelf-aware reason names the bottle)", () => {
  it("when the candidate shares an owned bottle's accord, the reason names that bottle", () => {
    const one = inputs({
      shelf: [{ fragranceId: "owned", name: "Side Effect", accordNames: [WOODY] }],
    });
    const reason = reasonFor(candidate("cand", { accordNames: [WOODY] }), one);
    expect(reason.line).toContain("Side Effect");
    expect(reason.slug).toBe("accord:shelf-match");
  });

  it("when the candidate only matches the onboarding prefs, the reason cites those accords", () => {
    const one = inputs({ accordPrefs: [GOURMAND] });
    const reason = reasonFor(candidate("cand", { accordNames: [GOURMAND] }), one);
    expect(reason.line).toContain("gourmand");
    expect(reason.slug).toBe("accord:profile-match");
  });

  it("a value pick within budget gets its own honest reason", () => {
    const reason = reasonFor(
      candidate("cand", {
        accordNames: [FRESH],
        estimateCentsLow: 2200,
        estimateCentsHigh: 3800,
      }),
      inputs(),
    );
    expect(reason.slug).toBe("value:within-budget");
    expect(reason.line).toContain("$22");
  });

  it("the reason text always resolves to a non-empty line (mandatory, PRD 7.1)", () => {
    // a maximally boring candidate: no accords, no estimate, no shelf
    const reason = reasonFor(candidate("bland", { accordNames: [] }), inputs());
    expect(reason.line.length).toBeGreaterThan(0);
    expect(reason.slug.length).toBeGreaterThan(0);
  });
});
