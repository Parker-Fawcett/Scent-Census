import { describe, expect, it } from "vitest";
import { searchCatalog } from "@/domain/catalogSearch";
import type { CatalogFragrance, CatalogHouse } from "@/domain/types";

const house = (id: string, name: string): CatalogHouse => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  tier: "DESIGNER",
});

const frag = (
  id: string,
  name: string,
  h: CatalogHouse,
  extra: Partial<CatalogFragrance> = {},
): CatalogFragrance => ({
  id,
  slug: id,
  name,
  house: h,
  year: 2020,
  inspiredById: null,
  noteNames: [],
  accordNames: [],
  ...extra,
});

const catalog = [
  frag("1", "Sauvage", house("dior", "Dior")),
  frag("2", "Sauvage Elixir", house("dior", "Dior")),
  frag("3", "Club de Nuit Intense Man", house("armaf", "Armaf"), {
    inspiredById: "999",
  }),
  frag("4", "Bleu de Chanel", house("chanel", "Chanel")),
];

describe("searchCatalog", () => {
  it("returns nothing on empty or whitespace queries", () => {
    expect(searchCatalog(catalog, "")).toEqual([]);
    expect(searchCatalog(catalog, "   ")).toEqual([]);
  });

  it("matches case-insensitively by name", () => {
    const hits = searchCatalog(catalog, "sauvage");
    expect(hits).toHaveLength(2);
  });

  it("ranks exact name over prefix over substring over house", () => {
    const items = [
      frag("a", "Sauvage Elixir", house("dior", "Dior")),
      frag("b", "Tres Sauvagewich", house("dream", "Sand Dreams")),
      frag("c", "Elixir Sauvage Fort", house("dream", "Sand Dreams")),
    ];
    const hits = searchCatalog(items, "sauvage");
    expect(hits[0].fragrance.id).toBe("a");
    expect(hits[0].matchKind).toBe("name-prefix");
    expect(hits[1].matchKind).toBe("name-contains");
  });

  it("finds fragrances by house name", () => {
    const hits = searchCatalog(catalog, "armaf");
    expect(hits).toHaveLength(1);
    expect(hits[0].fragrance.id).toBe("3");
    expect(hits[0].matchKind).toBe("house");
  });

  it("caps results at the limit (default 20)", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      frag(`x${i}`, `Sauvage Variant ${i}`, house("d", "Dior")),
    );
    expect(searchCatalog(many, "sauvage")).toHaveLength(20);
    expect(searchCatalog(many, "sauvage", { limit: 3 })).toHaveLength(3);
  });

  it("matches accented names when the user types without accents", () => {
    const accented = [
      frag("c", "Céline Pour Homme", house("celine", "Céline")),
      frag("r", "Généralement Frais", house("f", "Fraîche")),
    ];
    expect(searchCatalog(accented, "celine")).toHaveLength(1);
    expect(searchCatalog(accented, "generalement")).toHaveLength(1);
  });

  it("ignores leading and trailing whitespace around the query", () => {
    expect(searchCatalog(catalog, " sauvage ")).toHaveLength(2);
    expect(searchCatalog(catalog, "\tblack?")).toHaveLength(0);
  });
});
