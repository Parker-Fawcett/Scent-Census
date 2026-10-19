// Item add form validation (PRD section 7.2). The form is forgiving about
// WHICH optional field you skip and strict about the value when you enter
// one: an entered price is a real integer cents amount, an entered date is a
// real date, and a size is one of the bottle sizes the worth pipeline can
// price. Fragrance existence is not validated here; that is a foreign key.

import { describe, expect, it } from "vitest";
import { validateAddItem } from "@/domain/collection/addItem";

const base = { fragranceId: "frag1" };

describe("validateAddItem", () => {
  it("requires a fragrance id", () => {
    expect(() => validateAddItem({ ...base, fragranceId: "" })).toThrow(/fragrance/i);
    expect(() => validateAddItem({ ...base, fragranceId: "   " })).toThrow(/fragrance/i);
  });

  it("accepts each defined bottle size", () => {
    for (const sizeMl of [30, 50, 100]) {
      expect(validateAddItem({ ...base, sizeMl }).sizeMl).toBe(sizeMl);
    }
  });

  it("accepts an unknown size only through the 'other' escape value: 0", () => {
    expect(validateAddItem({ ...base, sizeMl: 0 }).sizeMl).toBeNull();
  });

  it("refuses sizes the worth pipeline cannot group (like 37 or -30)", () => {
    expect(() => validateAddItem({ ...base, sizeMl: 37 })).toThrow(/size/i);
    expect(() => validateAddItem({ ...base, sizeMl: -30 })).toThrow(/size/i);
  });

  it("accepts a price paid as whole dollars and converts to cents", () => {
    expect(validateAddItem({ ...base, pricePaidDollars: "89" }).pricePaidCents).toBe(8900);
    expect(validateAddItem({ ...base, pricePaidDollars: "89.5" }).pricePaidCents).toBe(8950);
  });

  it("refuses an entered price that is not a positive or zero amount", () => {
    expect(() => validateAddItem({ ...base, pricePaidDollars: "abc" })).toThrow(/price/i);
    expect(() => validateAddItem({ ...base, pricePaidDollars: "-5" })).toThrow(/price/i);
  });

  it("accepts a purchase date as a real date and refuses fake ones", () => {
    expect(validateAddItem({ ...base, purchasedOn: "2026-01-15" }).purchasedOn).toEqual(
      new Date("2026-01-15"),
    );
    expect(() => validateAddItem({ ...base, purchasedOn: "not-a-date" })).toThrow(/date/i);
  });

  it("sealed is explicit: default false, true only when true", () => {
    expect(validateAddItem({ ...base }).sealed).toBe(false);
    expect(validateAddItem({ ...base, sealed: true }).sealed).toBe(true);
  });

  it("the minimal add is legal: fragrance only", () => {
    const parsed = validateAddItem({ ...base });
    expect(parsed).toEqual({
      fragranceId: "frag1",
      sizeMl: null,
      pricePaidCents: null,
      purchasedOn: null,
      sealed: false,
    });
  });
});
