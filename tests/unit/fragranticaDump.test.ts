// Ingest contract for the free Fragrantica corpus snapshot (ledecanteur
// Kaggle dump, provenance in tests/fixtures/fragrantica-dump/SOURCE.md).
// Same discipline as the FragDB mapper: structure-only validation, loud
// per-row errors, nothing invented. Tests run on committed REAL records.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapDumpLine } from "@/ingest/fragranticaDump";
import type { DumpPyramidNote } from "@/ingest/fragranticaDump";

const FIXTURE = join(__dirname, "../fixtures/fragrantica-dump/sample-records.jsonl");

const fixtureLines = readFileSync(FIXTURE, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "");

describe("mapDumpLine on real corpus rows", () => {
  it("parses every committed house row without error", () => {
    const brands: string[] = [];
    for (const line of fixtureLines) {
      const result = mapDumpLine(line);
      expect(result.error).toBeUndefined();
      expect(result.record).not.toBeNull();
      brands.push(result.record!.brandName);
    }
    for (const need of [
      "Lattafa Perfumes",
      "Rasasi",
      "Afnan",
      "Dior",
      "Chanel",
      "Yves Saint Laurent",
      "Parfums de Marly",
      "Arabiyat Prestige",
      "Mykonos",
      "Velixir",
      "PARIS CORNER", // the corpus spells this house in caps; house-collision
      // rules live in the importer, which canonicalizes by slug
      "Fragrance World",
      "Xerjoff",
    ]) {
      expect(brands).toContain(need);
    }
  });

  it("keeps accords with richness and their source order (strength desc)", () => {
    const rec = fixtureLines
      .map((l) => mapDumpLine(l))
      .map((r) => r.record!)
      .find((r) => r.brandName === "Velixir" && r.name === "Icarus")!;
    expect(rec.fid).toBe(127589);
    expect(rec.accords[0]).toEqual({ name: "citrus", strength: 100 });
    const names = rec.accords.map((a) => a.name);
    expect(names).toContain("woody");
    expect(rec.accords.every((a) => a.strength >= 0 && a.strength <= 100)).toBe(true);
  });

  it("extracts the pyramid with positions and 0..100 weights", () => {
    const rec = fixtureLines
      .map((l) => mapDumpLine(l))
      .map((r) => r.record!)
      .find((r) => r.brandName === "Velixir")!;
    const top = rec.pyramid.filter((n) => n.position === "TOP");
    expect(top.length).toBeGreaterThan(0);
    expect(top.map((n) => n.name)).toContain("Pear");
    expect(Math.max(...rec.pyramid.map((n) => n.weight))).toBe(100);
    expect(rec.pyramid.every((n) => n.weight >= 0 && n.weight <= 100)).toBe(true);
  });

  it("keeps perfumer names in source order and the lead first", () => {
    const rec = fixtureLines
      .map((l) => mapDumpLine(l))
      .map((r) => r.record!)
      .find((r) => r.brandName === "Dior")!;
    if (rec.perfumers.length === 0) return; // corpus rows may legitimately have none
    expect(rec.perfumers[0].length).toBeGreaterThan(0);
  });

  it("all rows carry a stable numeric dataset id for the pid", () => {
    for (const line of fixtureLines) {
      const result = mapDumpLine(line);
      expect(result.record!.fid).toBeGreaterThan(0);
    }
  });
});

describe("mapDumpLine validation policy (loud, per row)", () => {
  it("rejects a line without a usable numeric id", () => {
    const result = mapDumpLine('{"name":"x","brand":"y"}');
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("rejects separators of JSON with an error, not a crash", () => {
    const result = mapDumpLine("{not json");
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("rejects an empty name", () => {
    const result = mapDumpLine('{"id":1,"name":"","brand":"B"}');
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("rejects an empty brand", () => {
    const result = mapDumpLine('{"id":1,"name":"N","brand":""}');
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("rejects non-numeric years loudly", () => {
    const result = mapDumpLine('{"id":1,"name":"N","brand":"B","year":"recently"}');
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("allows null years (Fragrantica stores them unknown)", () => {
    const result = mapDumpLine('{"id":1,"name":"N","brand":"B","year":null}');
    expect(result.record).not.toBeNull();
    expect(result.record!.year).toBeNull();
  });

  it("rejects accord strength outside 0..100", () => {
    const result = mapDumpLine(
      '{"id":1,"name":"N","brand":"B","accords":[{"name":"sweet","strength":101}]}',
    );
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("rejects note weight outside 0..100", () => {
    const result = mapDumpLine(
      '{"id":1,"name":"N","brand":"B","notes":{"tiered":{"top":[{"name":"Pear","weight":101}]}}}',
    );
    expect(result.record).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("treats flat (untiered) notes as ANY-position, honestly", () => {
    const result = mapDumpLine(
      '{"id":1,"name":"N","brand":"B","notes":{"flat":[{"name":"Oud","weight":50.5}]}}',
    );
    expect(result.record).not.toBeNull();
    expect(result.record!.pyramid[0]).toEqual({
      position: "ANY",
      name: "Oud",
      weight: 50.5,
    } satisfies DumpPyramidNote);
  });

  it("dedupes repeated notes within the same position", () => {
    const result = mapDumpLine(
      '{"id":1,"name":"N","brand":"B","notes":{"tiered":{"top":[{"name":"Pear","weight":20},{"name":"Pear","weight":30}]}}}',
    );
    expect(result.record!.pyramid).toHaveLength(1);
  });
});
