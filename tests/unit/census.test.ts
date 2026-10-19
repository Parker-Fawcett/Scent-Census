import { describe, expect, it } from "vitest";
import {
  BUCKET_VALUES,
  clearCloneVote,
  compareClones,
  rollupCensus,
  upsertCloneVote,
} from "@/domain/census";
import type { CloneVotePair } from "@/domain/types";

const uid = (n: number) => `u${n}`;
const vote = (userId: string, bucket: CloneVotePair["bucket"]): CloneVotePair => ({
  userId,
  cloneId: "clone",
  targetId: "target",
  bucket,
});

describe("upsertCloneVote", () => {
  it("is one vote per user per pair: a revote replaces, not appends", () => {
    const before = [vote(uid(1), "CLOSE"), vote(uid(2), "SIMILAR")];
    const after = upsertCloneVote(before, vote(uid(1), "SAME_FAMILY"));
    expect(after).toHaveLength(2);
    expect(after.find((v) => v.userId === "u1")?.bucket).toBe("SAME_FAMILY");
  });

  it("keeps other users' votes untouched", () => {
    const before = [vote(uid(1), "CLOSE"), vote(uid(2), "SIMILAR")];
    const after = upsertCloneVote(before, vote(uid(3), "CLOSE"));
    expect(after).toHaveLength(3);
  });
});

describe("rollupCensus", () => {
  it("returns an explicit unranked state for zero votes", () => {
    expect(rollupCensus([])).toMatchObject({
      sampleSize: 0,
      score: 0,
      rankLevel: "none",
      mostCommon: null,
    });
  });

  it("stays unranked under the 10-vote floor", () => {
    const votes = Array.from({ length: 9 }, (_, i) => vote(uid(i), "CLOSE"));
    expect(rollupCensus(votes)).toMatchObject({ rankLevel: "none", sampleSize: 9 });
  });

  it("enters ranked as low-confidence at the 10-vote floor", () => {
    const votes = Array.from({ length: 10 }, (_, i) => vote(uid(i), "CLOSE"));
    expect(rollupCensus(votes)).toMatchObject({ rankLevel: "low", sampleSize: 10 });
  });

  it("drops the confidence label at 25 votes", () => {
    const votes = Array.from({ length: 25 }, (_, i) => vote(uid(i), "CLOSE"));
    expect(rollupCensus(votes)).toMatchObject({ rankLevel: "confident", sampleSize: 25 });
  });

  it("maps buckets to the declared values", () => {
    expect(BUCKET_VALUES).toMatchObject({
      SPOT_ON: 95,
      CLOSE: 80,
      SIMILAR: 60,
      SAME_FAMILY: 35,
      NOT_CLOSE: 10,
    });
  });

  it("trims outliers before scoring: 24 CLOSE + 1 SPOT_ON scores exactly 80", () => {
    const votes = Array.from({ length: 24 }, (_, i) => vote(uid(i), "CLOSE"));
    votes.push(vote(uid(24), "SPOT_ON"));
    // untrimmed mean is 81.8; trimming 10% off each tail removes the 95 and
    // enough 80s that the mean lands exactly on 80
    expect(rollupCensus(votes).score).toBe(80);
  });

  it("reports the most common bucket in words for the unranked state", () => {
    const votes = [
      vote(uid(1), "CLOSE"),
      vote(uid(2), "CLOSE"),
      vote(uid(3), "SIMILAR"),
    ];
    expect(rollupCensus(votes).mostCommon).toBe("CLOSE");
  });
});

describe("compareClones", () => {
  it("respects the tie band: near-equal scores display as statistically tied", () => {
    const a = { sampleSize: 30, score: 80, rankLevel: "confident" as const, mostCommon: "CLOSE" as const };
    const b = { sampleSize: 30, score: 78, rankLevel: "confident" as const, mostCommon: "CLOSE" as const };
    expect(compareClones(a, b, { tieBand: 10 })).toBe("tied");
  });

  it("orders by score when they are properly separated", () => {
    const a = { sampleSize: 30, score: 80, rankLevel: "confident" as const, mostCommon: "CLOSE" as const };
    const b = { sampleSize: 30, score: 60, rankLevel: "confident" as const, mostCommon: "SIMILAR" as const };
    expect(compareClones(a, b)).toBe("a");
    expect(compareClones(b, a)).toBe("b");
  });

  it("never lets unranked clones hold a position over ranked ones", () => {
    const ranked = { sampleSize: 12, score: 80, rankLevel: "low" as const, mostCommon: "CLOSE" as const };
    const unranked = { sampleSize: 9, score: 0, rankLevel: "none" as const, mostCommon: null };
    expect(compareClones(unranked, ranked)).toBe("b");
    expect(compareClones(ranked, unranked)).toBe("a");
    expect(compareClones(unranked, unranked)).toBe("tied");
  });
});

describe("clearCloneVote", () => {
  it("removes one user's vote on a pair without touching anyone else's", () => {
    const votes = [vote(uid(1), "CLOSE"), vote(uid(2), "SIMILAR"), vote(uid(1), "SAME_FAMILY")];
    const after = clearCloneVote(votes, "u1", "clone", "target");
    expect(after).toHaveLength(1);
    expect(after[0].userId).toBe("u2");
  });

  it("does nothing when the user never voted on this pair", () => {
    const votes = [vote(uid(1), "CLOSE")];
    const after = clearCloneVote(votes, "u9", "clone", "target");
    expect(after).toHaveLength(1);
  });
});

describe("rollupCensus determinism", () => {
  it("picks the most common bucket independent of vote arrival order, even on ties", () => {
    // same tie multiset (1 CLOSE, 1 SIMILAR), either order; the label must not
    // follow which bucket happened to arrive first
    const orderA = ["CLOSE", "SIMILAR"] as const;
    const orderB = ["SIMILAR", "CLOSE"] as const;
    const fromOrder = (order: readonly ("CLOSE" | "SIMILAR")[]) =>
      order.map((b, i) => vote(uid(i), b));
    expect(rollupCensus(fromOrder(orderA)).mostCommon).toBe(
      rollupCensus(fromOrder(orderB)).mostCommon,
    );
  });
});
