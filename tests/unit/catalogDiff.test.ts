import { describe, expect, it } from "vitest";
import { diffReleases } from "@/domain/catalogDiff";
import type { ReleaseRecord } from "@/domain/types";

const rec = (pid: string, houseId: string, name = pid): ReleaseRecord => ({ pid, houseId, name });

describe("diffReleases", () => {
  it("emits exactly the new records as drops", () => {
    const prev = [rec("p1", "h1", "Sauvage"), rec("p2", "h2", "Khamrah")];
    const next = [...prev, rec("p3", "h2", "Khamrah Flanker")];
    const diff = diffReleases(prev, next);
    expect(diff.added).toEqual([rec("p3", "h2", "Khamrah Flanker")]);
    expect(diff.removed).toEqual([]);
  });

  it("flags disappeared records without ever calling them drops", () => {
    const prev = [rec("p1", "h1"), rec("p2", "h1")];
    const next = [rec("p1", "h1")];
    const diff = diffReleases(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([rec("p2", "h1")]);
  });

  it("is idempotent: same snapshot twice emits nothing", () => {
    const prev = [rec("p1", "h1")];
    expect(diffReleases(prev, prev)).toEqual({ added: [], removed: [] });
  });

  it("survives renames: same pid, new name is not an addition", () => {
    const prev = [rec("b7118", "h1", "Saleel")];
    const next = [rec("b7118", "h1", "Saleel Parfums")];
    expect(diffReleases(prev, next)).toEqual({ added: [], removed: [] });
  });

  it("refuses to diff a snapshot that lists the same pid twice", () => {
    // a duplicated pid means the ingest or the export is broken; diffing it
    // anyway would emit the same drop event twice and break the follow stream's
    // no-double-fire guarantee
    const broken = [rec("p1", "h1"), rec("p1", "h1")];
    expect(() => diffReleases([rec("old", "h1")], broken)).toThrow(/duplicate pid/);
    expect(() => diffReleases(broken, [rec("old", "h1")])).toThrow(/duplicate pid/);
  });
});
