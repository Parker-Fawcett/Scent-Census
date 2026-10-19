// PRD section 8 rule 1: a PricePoint stores when it was captured. This module
// decides staleness so the estimate function and future UI surfaces share ONE
// definition of "old data".
export function isStale(capturedAt: string, now: Date, windowDays = 30): boolean {
  void capturedAt;
  void now;
  void windowDays;
  throw new Error("not implemented: isStale");
}
