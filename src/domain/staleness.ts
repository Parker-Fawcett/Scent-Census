// PRD section 8 rule 1: a PricePoint stores when it was captured. This module
// decides staleness so the estimate function and future UI surfaces share ONE
// definition of "old data".
export function isStale(capturedAt: string, now: Date, windowDays = 30): boolean {
  const captured = new Date(capturedAt).getTime();
  if (Number.isNaN(captured)) return true; // unparseable timestamps never read fresh
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return now.getTime() - captured > windowMs;
}
