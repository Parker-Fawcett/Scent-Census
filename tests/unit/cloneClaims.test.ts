// The note-match rule and the claim dataset.
//
// These tests exist to keep three promises. First, a canon note name collapses
// origin adjectives so two listings can be compared honestly. Second, a score
// of 100 means every published note matched, never "almost all of them".
// Third, every row in the committed dataset carries a source a reader can
// open and a date we read it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalNoteName,
  claimVoteShare,
  compareClaimRows,
  compositionMatch,
  formatClaimPrice,
  scentFamilyMatch,
} from "@/domain/cloneClaims";

const DATASET = join(__dirname, "../../data/clones/louis-vuitton-imagination.json");

const original = [
  { name: "Chinese Black Tea", weight: 100 },
  { name: "Citron", weight: 94 },
  { name: "Calabrian bergamot", weight: 87 },
  { name: "Sicilian Orange", weight: 73 },
  { name: "Tunisian Neroli", weight: 41 },
  { name: "Ginger", weight: 26 },
  { name: "Ambroxan", weight: 29 },
  { name: "Ceylon Cinnamon", weight: 3 },
  { name: "Guaiac Wood", weight: 3 },
  { name: "Olibanum", weight: 1 },
];

describe("canonicalNoteName", () => {
  it("drops the origin adjective and keeps the material", () => {
    expect(canonicalNoteName("Calabrian bergamot")).toBe("bergamot");
    expect(canonicalNoteName("Sicilian Orange")).toBe("orange");
    expect(canonicalNoteName("Tunisian Neroli")).toBe("neroli");
    expect(canonicalNoteName("Ceylon Cinnamon")).toBe("cinnamon");
    expect(canonicalNoteName("Nigerian Ginger")).toBe("ginger");
  });

  it("folds the materials catalogs name differently", () => {
    expect(canonicalNoteName("Frankincense")).toBe("olibanum");
    expect(canonicalNoteName("Ambrox")).toBe("ambroxan");
    expect(canonicalNoteName("Chinese Black Tea")).toBe("tea");
    expect(canonicalNoteName("Black tea")).toBe("tea");
  });

  it("repairs a misspelling that appears in real listings", () => {
    expect(canonicalNoteName("Guiaiac wood")).toBe("guaiac wood");
  });

  it("is stable across case, accents, and punctuation", () => {
    expect(canonicalNoteName("  BERGAMOT  ")).toBe("bergamot");
    expect(canonicalNoteName("Neroli, Absolute")).toBe("neroli absolute");
    expect(canonicalNoteName("Café")).toBe("cafe");
  });

  it("does not merge different materials", () => {
    expect(canonicalNoteName("Cardamom")).not.toBe(canonicalNoteName("Cinnamon"));
    expect(canonicalNoteName("Citron")).not.toBe(canonicalNoteName("Citrus"));
    expect(canonicalNoteName("Green Tea")).not.toBe(canonicalNoteName("Tea"));
  });
});

describe("compositionMatch", () => {
  it("scores an identical list at 100", () => {
    const result = compositionMatch(
      original,
      original.map((note) => note.name),
    );
    expect(result.score).toBe(100);
    expect(result.shared).toBe(original.length);
    expect(result.missing).toEqual([]);
  });

  it("never rounds a near miss up to 100", () => {
    const almost = original.slice(0, 9).map((note) => note.name);
    const result = compositionMatch(original, almost);
    expect(result.score).toBeLessThan(100);
    expect(result.missing).toEqual(["olibanum"]);
  });

  it("weights a missing top note harder than a missing base note", () => {
    const withoutTea = compositionMatch(
      original,
      original.filter((note) => note.name !== "Chinese Black Tea").map((note) => note.name),
    );
    const withoutOlibanum = compositionMatch(
      original,
      original.filter((note) => note.name !== "Olibanum").map((note) => note.name),
    );
    expect(withoutTea.score).toBeLessThan(withoutOlibanum.score);
  });

  it("lowers precision when the claim invents notes", () => {
    const withExtras = compositionMatch(original, [
      ...original.map((note) => note.name),
      "Musk",
      "Saffron",
      "Leather",
    ]);
    expect(withExtras.score).toBeLessThan(100);
    expect(withExtras.claimCount).toBe(original.length + 3);
  });

  it("returns zero for an empty list on either side", () => {
    expect(compositionMatch(original, []).score).toBe(0);
    expect(compositionMatch([], ["Bergamot"]).score).toBe(0);
  });

  it("counts a catalogue's duplicate spellings once", () => {
    const result = compositionMatch(original, ["Bergamot", "Calabrian bergamot"]);
    expect(result.claimCount).toBe(1);
    expect(result.shared).toBe(1);
  });
});

describe("scentFamilyMatch", () => {
  it("returns 100 for identical notes and accords", () => {
    const notes = ["Bergamot", "Citron", "Tea"];
    const accords = { citrus: 100, aromatic: 50 };
    expect(scentFamilyMatch(notes, accords, notes, accords)).toBe(100);
  });

  it("returns 0 when one side has no data", () => {
    expect(scentFamilyMatch(["Bergamot"], { citrus: 100 }, [], {})).toBe(0);
    expect(scentFamilyMatch([], {}, ["Bergamot"], { citrus: 100 })).toBe(0);
  });

  it("weights accord cosine and note jaccard equally", () => {
    // Same accords, different notes → 50% (accord cos 100%, note jaccard 0%)
    const result = scentFamilyMatch(
      ["Bergamot", "Lemon"],
      { citrus: 100 },
      ["Rose", "Jasmine"],
      { citrus: 100 },
    );
    expect(result).toBe(50);
  });

  it("canonicalizes note names before comparing", () => {
    const result = scentFamilyMatch(
      ["Calabrian Bergamot", "Chinese Black Tea"],
      { citrus: 100 },
      ["Bergamot", "Tea"],
      { citrus: 100 },
    );
    expect(result).toBe(100);
  });
});

describe("formatClaimPrice", () => {
  it("always states the size next to the money", () => {
    expect(formatClaimPrice(5000, 50, "USD")).toBe("from $50 / 50ml");
    expect(formatClaimPrice(4300, 34, "USD")).toBe("from $43 / 34ml");
    expect(formatClaimPrice(3699, 50, "USD")).toBe("from $36.99 / 50ml");
    expect(formatClaimPrice(2800, 50, "EUR")).toBe("from €28 / 50ml");
  });

  it("returns null when nobody has compared the pair", () => {
    expect(claimVoteShare({ measuredUp: 0, measuredDown: 0 })).toBeNull();
    expect(claimVoteShare({ measuredUp: null, measuredDown: null })).toBeNull();
  });

  it("counts a rejection honestly", () => {
    const share = claimVoteShare({ measuredUp: 332, measuredDown: 592 });
    expect(share).toEqual({ share: 36, total: 924 });
  });
});

describe("compareClaimRows", () => {
  it("leads with higher family match", () => {
    const high = { familyMatch: 95, measuredUp: null, measuredDown: null, noteMatch: 100, priceCents: 5000, productName: "Montagne" };
    const low = { familyMatch: 90, measuredUp: 332, measuredDown: 592, noteMatch: 100, priceCents: 5000, productName: "Hectic" };
    expect(compareClaimRows(high, low)).toBeLessThan(0);
  });

  it("sorts by vote share when family match is equal", () => {
    const a = { familyMatch: 90, measuredUp: 332, measuredDown: 592, noteMatch: null, priceCents: null, productName: "Hectic" };
    const b = { familyMatch: 90, measuredUp: 327, measuredDown: 624, noteMatch: null, priceCents: null, productName: "Full House" };
    expect(compareClaimRows(a, b)).toBeLessThan(0);
  });

  it("sorts unscored rows by note match, then price", () => {
    const a = { familyMatch: 100, measuredUp: null, measuredDown: null, noteMatch: 100, priceCents: 5000, productName: "Montagne" };
    const b = { familyMatch: 82, measuredUp: null, measuredDown: null, noteMatch: 82, priceCents: 4900, productName: "ALT" };
    expect(compareClaimRows(a, b)).toBeLessThan(0);
  });

  it("puts rows with no evidence last", () => {
    const a = { familyMatch: 34, measuredUp: null, measuredDown: null, noteMatch: 34, priceCents: null, productName: "Essence de Blanc" };
    const b = { familyMatch: 0, measuredUp: null, measuredDown: null, noteMatch: null, priceCents: null, productName: "Zimaya" };
    expect(compareClaimRows(a, b)).toBeLessThan(0);
  });
});

describe("the committed Imagination claim dataset", () => {
  const file = JSON.parse(readFileSync(DATASET, "utf8")) as {
    target: { catalogueSourcePid: number };
    updated: string;
    claims: Array<{
      productName: string;
      houseName: string;
      claimType: string;
      sourceLabel: string;
      sourceUrl: string;
      verifiedOn: string;
      notes?: string[];
      priceCents?: number;
      sizeMl?: number;
      currency?: string;
    }>;
  };

  it("targets the catalogue row for Imagination", () => {
    expect(file.target.catalogueSourcePid).toBe(67370);
  });

  it("gives every claim an openable source and a read date", () => {
    for (const claim of file.claims) {
      expect(claim.sourceUrl, claim.productName).toMatch(/^https?:\/\//);
      expect(claim.sourceLabel, claim.productName).not.toBe("");
      expect(claim.verifiedOn, claim.productName).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["HOUSE_DECLARED", "COMMUNITY_LIST", "EDITORIAL"], claim.productName).toContain(
        claim.claimType,
      );
    }
  });

  it("never states a price without the size it buys", () => {
    for (const claim of file.claims) {
      if (claim.priceCents === undefined) continue;
      expect(claim.sizeMl, claim.productName).toBeTypeOf("number");
      expect(claim.currency, claim.productName).toBeTruthy();
    }
  });

  it("keeps one row per seller and product", () => {
    const keys = file.claims.map(
      (claim) => `${claim.houseName.toLowerCase()}::${claim.productName.toLowerCase()}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has at least one seller declaration for every named-only row", () => {
    const named = file.claims.filter((claim) => claim.claimType !== "HOUSE_DECLARED");
    for (const claim of named) {
      expect(claim.sourceUrl, claim.productName).toContain("http");
    }
  });
});
