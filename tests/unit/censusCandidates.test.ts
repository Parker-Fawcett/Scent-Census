// Census curation, part 1: candidate SELECTION is a pure, tested decision.
// The corpus's community reminds_me_of votes rank clone-side candidates by
// NET upvotes. Weak signal below the floor is dropped, and disputed edges
// (net below zero) stay visible with their dispute flag: the community's
// disagreement with clone folklore is part of the census story, not noise to
// hide. Selection only proposes; nothing enters Fragrance.inspiredById
// without the approved-by-hand file.

import { describe, expect, it } from "vitest";
import { houseSlugFor, NET_PAUSE_FLOOR, rankCloneCandidates, type CorpusRowInput } from "@/curation/censusCandidates";

const CLONE_HOUSES = new Set(["lattafa-perfumes"]);

describe("houseSlugFor (the brand->pool key)", () => {
  it("slugifies brand display names so 'Lattafa Perfumes' matches the published key", () => {
    expect(houseSlugFor("Lattafa Perfumes")).toBe("lattafa-perfumes");
  });
});

describe("rankCloneCandidates", () => {
  const khamrahRow: CorpusRowInput = {
    fid: 100,
    slug: "Lattafa-Perfumes/Khamrah",
    brand: "Lattafa Perfumes",
    name: "Khamrah",
    reminds: [
      { targetFid: 7, targetBrand: "By Kilian", targetName: "Angels' Share", up: 1284, down: 2446 },
      { targetFid: 8, targetBrand: "Giorgio Armani", targetName: "Stronger With You Intensely", up: 560, down: 1038 },
      { targetFid: 9, targetBrand: "Dior", targetName: "Fahrenheit", up: 401, down: 30 },
    ],
  };
  const designerRow: CorpusRowInput = {
    fid: 200,
    slug: "Dior/Sauvage",
    brand: "Dior",
    name: "Sauvage",
    reminds: [{ targetFid: 300, targetBrand: "Lattafa Perfumes", targetName: "Asad", up: 500, down: 10 }],
  };
  const flankerTargetRow: CorpusRowInput = {
    fid: 101,
    slug: "Lattafa-Perfumes/Khamrah-Qahwa",
    brand: "Lattafa Perfumes",
    name: "Khamrah Qahwa",
    reminds: [{ targetFid: 310, targetBrand: "By Kilian", targetName: "Angels' Share Flanker", up: 900, down: 0 }],
  };

  it("keeps only clone-house fragrances as the clone side", () => {
    const out = rankCloneCandidates([khamrahRow, designerRow], { cloneHouseSlugs: CLONE_HOUSES });
    expect(out.map((c) => c.fid)).toEqual([100, 100, 100]); // Dior row proposes nothing
  });

  it("targets only non-clone-house fragrances: clone-to-clone comparisons are not census edges", () => {
    // Khamrah Qahwa (clone house) reminding of another house is fine, but the
    // clone row here is a flanker whose target row is a clone house only in
    // the EXCLUSION check through the target's brand
    const out = rankCloneCandidates([flankerTargetRow], { cloneHouseSlugs: CLONE_HOUSES });
    expect(out).toHaveLength(1); // target brand is By Kilian: legal edge

    const cloneTargetRow: CorpusRowInput = {
      fid: 102,
      slug: "Lattafa-Perfumes/Asad",
      brand: "Lattafa Perfumes",
      name: "Asad",
      reminds: [{ targetFid: 400, targetBrand: "Lattafa Perfumes", targetName: "Khamrah", up: 900, down: 0 }],
    };
    const out2 = rankCloneCandidates([cloneTargetRow], { cloneHouseSlugs: CLONE_HOUSES });
    expect(out2).toHaveLength(0); // the target is itself a clone-house fragrance
  });

  it("ranks by net votes, strongest first, carrying the raw counts", () => {
    const other: CorpusRowInput = {
      fid: 103,
      slug: "Lattafa-Perfumes/Fakhar",
      brand: "Lattafa Perfumes",
      name: "Fakhar",
      reminds: [{ targetFid: 300, targetBrand: "Dior", targetName: "Sauvage Elixir", up: 731, down: 79 }],
    };
    const out = rankCloneCandidates([khamrahRow, other], { cloneHouseSlugs: CLONE_HOUSES });
    // Khamrah->Fahrenheit (371), Fakhar->Sauvage Elixir (652), Khamrah->Angels
    // Share disputed, Khamrah->SWYI disputed
    expect(out[0].net).toBe(652);
    expect(out[0].up).toBe(731);
    expect(out[0].down).toBe(79);
    expect(out[1].net).toBe(371);
    expect(out.map((c) => c.targetFid)).toContain(7); // strangers stay in the list
    expect(out.at(-1)!.net).toBeLessThan(0);
  });

  it("drops sub-floor weak signal in the DEFAULT unranked output", () => {
    const quiet: CorpusRowInput = {
      fid: 104,
      slug: "Lattafa-Perfumes/Qimmah",
      brand: "Lattafa Perfumes",
      name: "Qimmah",
      reminds: [{ targetFid: 300, targetBrand: "Dior", targetName: "Fahrenheit", up: 5, down: 0 }],
    };
    const out = rankCloneCandidates([quiet], { cloneHouseSlugs: CLONE_HOUSES });
    expect(out).toHaveLength(0);
    expect(NET_PAUSE_FLOOR).toBe(100);
  });

  it("flags disputed edges: net below zero stays visible with caught disagreement data", () => {
    const disputed: CorpusRowInput = {
      fid: 105,
      slug: "Lattafa-Perfumes/Khamrah-Storm",
      brand: "Lattafa Perfumes",
      name: "Khamrah Storm",
      reminds: [{ targetFid: 300, targetBrand: "Dior", targetName: "Eau Sauvage", up: 401, down: 1300 }],
    };
    const out = rankCloneCandidates([disputed], { cloneHouseSlugs: CLONE_HOUSES });
    expect(out).toHaveLength(1);
    expect(out[0].disputed).toBe(true);
    expect(out[0].net).toBe(-899);
    expect(out[0].up).toBe(401);
    expect(out[0].down).toBe(1300);
  });

  it("never proposes a fragrance reminding of itself", () => {
    const selfRow: CorpusRowInput = {
      fid: 106,
      slug: "Lattafa-Perfumes/Loop",
      brand: "Lattafa Perfumes",
      name: "Loop",
      reminds: [{ targetFid: 106, targetBrand: "Lattafa Perfumes", targetName: "Loop", up: 9999, down: 0 }],
    };
    expect(rankCloneCandidates([selfRow], { cloneHouseSlugs: CLONE_HOUSES })).toHaveLength(0);
  });
});
