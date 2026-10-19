// Vote domain rules, PRD section 7.3 + section 9: a vote is user + fragrance
// + direction + the reason line that was showing. Votes are revisionable:
// tap again to un-vote, change direction to revise. Validation lives in the
// domain so every entry point enforces the same contract.

import { describe, expect, it } from "vitest";
import { VOTE_DIRECTIONS, parseVoteDirection, validateVote } from "@/domain/votes";

describe("parseVoteDirection", () => {
  it("accepts every PRD direction", () => {
    expect(VOTE_DIRECTIONS).toEqual(["LIKE", "DISLIKE", "DECLINE", "OWN"]);
  });

  it("upper-cases and trims tolerant input", () => {
    expect(parseVoteDirection(" like ")).toBe("LIKE");
  });

  it("rejects unknown directions with the allowed list in the message", () => {
    expect(() => parseVoteDirection("MEH")).toThrow(/LIKE, DISLIKE, DECLINE, OWN/);
  });
});

describe("validateVote", () => {
  it("keeps a well-formed vote", () => {
    const parsed = validateVote({ direction: "like", reasonSlug: "accord-match:woody" });
    expect(parsed).toEqual({ direction: "LIKE", reasonSlug: "accord-match:woody" });
  });

  it("trims the reason slug but keeps its content", () => {
    const parsed = validateVote({ direction: "DISLIKE", reasonSlug: "  house-family  " });
    expect(parsed.reasonSlug).toBe("house-family");
  });

  it("allows a product-page vote with no reason line showing", () => {
    const parsed = validateVote({ direction: "LIKE" });
    expect(parsed.reasonSlug).toBeNull();
  });

  it("rejects an empty reason slug as present-but-blank, loudly", () => {
    expect(() => validateVote({ direction: "LIKE", reasonSlug: "   " })).toThrow(/blank/);
  });

  it("rejects an unreasonably long reason slug", () => {
    expect(() => validateVote({ direction: "LIKE", reasonSlug: "x".repeat(80) })).toThrow(
      /reason slug/,
    );
  });

  it("rejects blank fragrance ids (the caller must prove the fragrance)", () => {
    expect(() =>
      validateVote({ direction: "LIKE" }, { fragranceId: "   " }),
    ).toThrow(/fragrance id/i);
  });
});
