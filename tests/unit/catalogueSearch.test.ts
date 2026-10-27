import { describe, expect, it } from "vitest";
import {
  fold,
  rankCandidates,
  trigramSimilarity,
  type CandidateRow,
} from "@/server/catalogueSearch";

// The search is forgiving on purpose. You should not have to type a name
// exactly to find a scent, because nobody types a name exactly. These
// tests are the contract for that.

const house = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
});

const row = (
  id: string,
  name: string,
  h: { id: string; name: string; slug: string },
  extra: Partial<CandidateRow> = {},
): CandidateRow => ({
  id,
  name,
  slug: id,
  year: 2020,
  catalogueSourcePid: `pid-${id}`,
  houseId: h.id,
  houseName: h.name,
  houseSlug: h.slug,
  cloneCount: 0,
  ...extra,
});

const dior = house("dior", "Dior");
const armaf = house("armaf", "Armaf");
const lattafa = house("lattafa", "Lattafa Perfumes");

const catalog: CandidateRow[] = [
  row("1", "Sauvage", dior),
  row("2", "Sauvage Elixir", dior),
  row("3", "Club de Nuit Intense Man", armaf),
  row("4", "Bleu de Chanel", house("chanel", "Chanel")),
  row("5", "Khamrah", lattafa),
  row("6", "Asad", lattafa),
  row("7", "Aventus", house("creed", "Creed"), { cloneCount: 131 }),
];

const rank = (query: string, rows: CandidateRow[] = catalog, houses = [dior, armaf, lattafa]) =>
  rankCandidates(rows, houses, query, { limit: 60 });

describe("fold", () => {
  it("strips diacritics and lowercases", () => {
    expect(fold("Céline Pour Homme")).toBe("celine pour homme");
    expect(fold("  Sauvage  ")).toBe("sauvage");
  });
});

describe("trigramSimilarity", () => {
  it("scores a typo lower than the exact word but still high", () => {
    expect(trigramSimilarity("lattafa", "lattafa")).toBe(1);
    expect(trigramSimilarity("lattfa", "lattafa")).toBeGreaterThan(0.4);
    expect(trigramSimilarity("aventus", "banana")).toBeLessThan(0.2);
  });
});

describe("rankCandidates", () => {
  it("returns nothing on empty or whitespace queries", () => {
    expect(rank("")).toEqual([]);
    expect(rank("   ")).toEqual([]);
  });

  it("matches case-insensitively by name", () => {
    const hits = rank("sauvage");
    expect(hits.map((h) => h.id)).toEqual(["1", "2"]);
  });

  it("ranks exact name over prefix over contains", () => {
    const items = [
      row("a", "Sauvage Elixir", dior),
      row("b", "Sauvage", dior),
      row("c", "Tres Sauvagewich", house("dream", "Sand Dreams")),
    ];
    const hits = rank("sauvage", items, [dior, house("dream", "Sand Dreams")]);
    expect(hits[0].id).toBe("b");
    expect(hits[0].matchKind).toBe("exact-name");
    expect(hits[1].id).toBe("a");
    expect(hits[1].matchKind).toBe("name-prefix");
    expect(hits[2].id).toBe("c");
    expect(hits[2].matchKind).toBe("word-prefix");
  });

  it("finds a fragrance by house name", () => {
    const hits = rank("chanel");
    expect(hits.map((h) => h.id)).toContain("4");
  });

  it("brings up the whole house when the house name is typed", () => {
    const hits = rank("lattafa");
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("5");
    expect(ids).toContain("6");
  });

  it("survives a typo in a fragrance name", () => {
    const hits = rank("avntus");
    expect(hits[0].id).toBe("7");
    expect(hits[0].matchKind).toBe("close-spelling");
  });

  it("survives a typo in a house name", () => {
    const hits = rank("lattfa");
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("5");
    expect(ids).toContain("6");
  });

  it("survives a typo in a multi-word name", () => {
    const hits = rank("clb de nut");
    expect(hits.map((h) => h.id)).toContain("3");
  });

  it("matches a multi-word query in any order across name and house", () => {
    const hits = rank("intense armaf");
    expect(hits.map((h) => h.id)).toContain("3");
  });

  it("matches accented names when the user types without accents", () => {
    const accented = [row("c", "Céline Pour Homme", house("celine", "Céline"))];
    const houses = [house("celine", "Céline")];
    expect(rank("celine", accented, houses).map((h) => h.id)).toEqual(["c"]);
  });

  it("rejects a query whose words match nothing at all", () => {
    expect(rank("sauvage nonexistent")).toEqual([]);
  });

  it("ignores leading and trailing whitespace around the query", () => {
    expect(rank(" sauvage ")).toHaveLength(2);
  });

  it("caps the results at the limit", () => {
    const many = Array.from({ length: 50 }, (_, i) => row(`x${i}`, `Sauvage Variant ${i}`, dior));
    expect(rank("sauvage", many, [dior])).toHaveLength(50);
    expect(rankCandidates(many, [dior], "sauvage", { limit: 3 })).toHaveLength(3);
  });

  it("can be limited to fragrances that have measured clones", () => {
    const hits = rankCandidates(catalog, [dior, armaf, lattafa], "aventus", {
      withClonesOnly: true,
    });
    expect(hits.map((h) => h.id)).toEqual(["7"]);
  });

  it("does not return the same fragrance twice when it matches two ways", () => {
    const hits = rank("lattafa");
    const ids = hits.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
