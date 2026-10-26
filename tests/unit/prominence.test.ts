// Accords are the family summary, notes are the materials. They use
// different filters because they are different measurements.

import { describe, expect, it } from "vitest";
import { filterAccords, filterByProminence } from "@/domain/prominence";

describe("filterAccords", () => {
  it("keeps every voted family on a scent with one dominant accord", () => {
    // Louis Vuitton Imagination: the old 35% relative floor kept citrus only.
    const imagination = [
      { name: "citrus", strength: 100 },
      { name: "fresh spicy", strength: 34 },
      { name: "green", strength: 28 },
      { name: "fresh", strength: 26 },
      { name: "aromatic", strength: 11 },
      { name: "sweet", strength: 9 },
      { name: "amber", strength: 9 },
      { name: "floral", strength: 8 },
    ];
    expect(filterAccords(imagination)).toEqual([
      "citrus",
      "fresh spicy",
      "green",
      "fresh",
      "aromatic",
      "sweet",
      "amber",
      "floral",
    ]);
  });

  it("sorts strongest first and drops zero-strength rows", () => {
    expect(
      filterAccords([
        { name: "woody", strength: 40 },
        { name: "citrus", strength: 100 },
        { name: "ghost", strength: 0 },
      ]),
    ).toEqual(["citrus", "woody"]);
  });

  it("drops empty names", () => {
    expect(filterAccords([{ name: "  ", strength: 50 }])).toEqual([]);
  });
});

describe("filterByProminence", () => {
  it("still floors notes relative to the strongest note", () => {
    expect(
      filterByProminence([
        { name: "leather", strength: 100 },
        { name: "jasmine", strength: 0 },
        { name: "sweet", strength: 26 },
      ]),
    ).toEqual(["leather"]);
  });
});
