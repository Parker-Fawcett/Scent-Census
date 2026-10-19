import { describe, expect, it } from "vitest";
import { isStale } from "@/domain/staleness";

const NOW = new Date("2026-10-19T12:00:00Z");
const daysAgo = (n: number, offsetMs = 0) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000 - offsetMs).toISOString();

describe("isStale", () => {
  it("counts data captured before the window as stale", () => {
    expect(isStale(daysAgo(31), NOW, 30)).toBe(true);
  });

  it("keeps data inside the window fresh", () => {
    expect(isStale(daysAgo(29), NOW, 30)).toBe(false);
  });

  it("treats the exact window boundary as fresh (>)", () => {
    expect(isStale(daysAgo(30, 1), NOW, 30)).toBe(true);
    expect(isStale(daysAgo(30), NOW, 30)).toBe(false);
  });

  it("defaults to the 30-day window from floors", () => {
    expect(isStale(daysAgo(45), NOW)).toBe(true);
    expect(isStale(daysAgo(10), NOW)).toBe(false);
  });

  it("never trusts an unparseable timestamp as fresh", () => {
    expect(isStale("not-a-date", NOW, 30)).toBe(true);
  });
});
