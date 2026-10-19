// M1 ingest contract tests, run against the COMMITTED REAL FragDB sample
// files (tests/fixtures/fragdb-samples). FragDB ships pipe-delimited RFC4180 CSVs:
// descriptions contain literal pipes, commas, and quotes inside quoted fields,
// so the parser and mapper are proven against the real shape, not a fantasy.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mapFragDBCatalog,
  parseDelimitedCsv,
  toMappedCatalogFragrance,
} from "../../src/ingest/fragdb";
import type { FragDBCatalog, FragDBInputs, MappedCatalogFragrance } from "../../src/ingest/fragdb";
import { searchCatalog } from "@/domain/catalogSearch";

const samplesDir = join(__dirname, "../fixtures/fragdb-samples");
const read = (name: string) => readFileSync(join(samplesDir, name), "utf8");

// Re-serialize parsed rows with RFC4180 quoting forced on every field, so
// rows containing pipes in their descriptions survive the round trip.
const rowsToCsv = (rows: string[][]): string =>
  rows
    .map((row) => row.map((field) => `"${field.replace(/"/g, '""')}"`).join("|"))
    .join("\n") + "\n";

const fragrancesCsv = () => read("fragrances.csv");
const accordsCsv = () => read("accords.csv");
const notesCsv = () => read("notes.csv");

const inputs = (): FragDBInputs => ({
  fragrancesCsv: fragrancesCsv(),
  notesCsv: notesCsv(),
  accordsCsv: accordsCsv(),
});

const sample = (): FragDBCatalog => mapFragDBCatalog(inputs());

const byPid = (records: MappedCatalogFragrance[], pid: string): MappedCatalogFragrance => {
  const record = records.find((r) => r.pid === pid);
  if (!record) throw new Error(`fixture lost pid ${pid}: fix the mapper, not this test`);
  return record;
};

describe("parseDelimitedCsv", () => {
  it("preserves quoted fields containing delimiters and escaped quotes", () => {
    const rows = parseDelimitedCsv('a|"x|y""z"""|b', "|");
    expect(rows).toEqual([["a", 'x|y"z"', "b"]]);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseDelimitedCsv("a|b\r\nc|d\r\n", "|")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("parses the real fragrances sample into 10 rows of 30 fields", () => {
    const rows = parseDelimitedCsv(fragrancesCsv(), "|");
    expect(rows).toHaveLength(11); // header + 10 records
    expect(rows[0][0]).toBe("pid");
    for (const row of rows) expect(row).toHaveLength(30);
  });
});

describe("mapFragDBCatalog", () => {
  it("maps the real sample with zero errors and keeps pids unique", () => {
    const catalog = sample();
    expect(catalog.errors).toEqual([]);
    expect(catalog.records).toHaveLength(10);
    expect(new Set(catalog.records.map((r) => r.pid)).size).toBe(10);
  });

  it("maps Light Blue: house from the row's own brand cell", () => {
    const lb = byPid(sample().records, "485");
    expect(lb).toBeDefined();
    expect(lb.name).toBe("Light Blue");
    expect(lb.housePid).toBe("b72");
    expect(lb.houseName).toBe("Dolce&Gabbana");
    expect(lb.year).toBe(2001);
    expect(lb.slugBase).toBe("light-blue");
  });

  it("keeps accord pids with their 0..100 strength", () => {
    const lb = byPid(sample().records, "485");
    expect(lb.accords[0]).toEqual({ accordPid: "a24", strength: 100 });
  });

  it("parses pyramid positions with opacity and raw weight", () => {
    const lb = byPid(sample().records, "485");
    const top = lb.pyramid.filter((n) => n.position === "TOP");
    expect(top).toContainEqual({
      position: "TOP",
      notePid: "n2415",
      opacity: 1.0,
      weightRaw: 5.0,
    });
    expect(lb.pyramid.some((n) => n.position === "HEART")).toBe(true);
    expect(lb.pyramid.some((n) => n.position === "BASE")).toBe(true);
  });

  it("drops the exact-duplicate pyramid entry FragDB emits", () => {
    const lb = byPid(sample().records, "485");
    // source has n1985,0.93,3.48 listed twice in the top segment
    const n1985 = lb.pyramid.filter((n) => n.position === "TOP" && n.notePid === "n1985");
    expect(n1985).toHaveLength(1);
  });

  it("resolves perfumer pids that ride along in the row", () => {
    const lb = byPid(sample().records, "485");
    expect(lb.perfumers).toEqual(["p39"]);
  });

  it("never invents clone edges: inspiredById is null everywhere", () => {
    const records = sample().records;
    expect(records.every((r) => r.inspiredById === null)).toBe(true);
  });

  it("tolerates empty accords and empty pyramid as empty arrays", () => {
    const base = parseDelimitedCsv(fragrancesCsv(), "|")[1];
    base[11] = "";
    base[12] = "";
    const catalog = mapFragDBCatalog({
      fragrancesCsv: rowsToCsv([parseDelimitedCsv(fragrancesCsv(), "|")[0], base]),
      notesCsv: notesCsv(),
      accordsCsv: accordsCsv(),
    });
    expect(catalog.errors).toEqual([]);
    expect(catalog.records).toHaveLength(1);
    expect(catalog.records[0].accords).toEqual([]);
    expect(catalog.records[0].pyramid).toEqual([]);
  });

  it("fails the row loud on a structurally broken pyramid", () => {
    const header = parseDelimitedCsv(fragrancesCsv(), "|")[0];
    const good = parseDelimitedCsv(fragrancesCsv(), "|")[1];
    const bad = [...good];
    bad[0] = "777";
    bad[3] = "Broken";
    bad[12] = "top(not-a-pyramid)middle(also-bad)base(x)";
    const catalog = mapFragDBCatalog({
      fragrancesCsv: rowsToCsv([header, good, bad]),
      notesCsv: notesCsv(),
      accordsCsv: accordsCsv(),
    });
    expect(catalog.records.map((r) => r.pid)).not.toContain("777");
    const err = catalog.errors.find((e) => e.pid === "777");
    if (!err) throw new Error("no error recorded for the broken pyramid row");
    expect(err.message).toMatch(/pyramid/i);
  });

  it("fails the row loud on a non-numeric year", () => {
    const header = parseDelimitedCsv(fragrancesCsv(), "|")[0];
    const good = parseDelimitedCsv(fragrancesCsv(), "|")[1];
    const bad = [...good];
    bad[0] = "888";
    bad[4] = "20o1";
    const catalog = mapFragDBCatalog({
      fragrancesCsv: rowsToCsv([header, good, bad]),
      notesCsv: notesCsv(),
      accordsCsv: accordsCsv(),
    });
    expect(catalog.records.map((r) => r.pid)).not.toContain("888");
    const yearErr = catalog.errors.find((e) => e.pid === "888");
    if (!yearErr) throw new Error("no error recorded for the bad year row");
    expect(yearErr.message).toMatch(/year/i);
  });

  it("fails the row loud on an accord token without a 0..100 strength", () => {
    const header = parseDelimitedCsv(fragrancesCsv(), "|")[0];
    const good = parseDelimitedCsv(fragrancesCsv(), "|")[1];
    const bad = [...good];
    bad[0] = "999";
    bad[11] = "a24:high";
    const catalog = mapFragDBCatalog({
      fragrancesCsv: rowsToCsv([header, good, bad]),
      notesCsv: notesCsv(),
      accordsCsv: accordsCsv(),
    });
    const accordErr = catalog.errors.find((e) => e.pid === "999");
    if (!accordErr) throw new Error("no error recorded for the bad accord row");
    expect(accordErr.message).toMatch(/accord/i);
  });
});

describe("toMappedCatalogFragrance", () => {
  it("feeds mapped records straight into the domain search seam", () => {
    const { records } = sample();
    const lb = byPid(records, "485");
    const catalogFragrance = toMappedCatalogFragrance(lb, {
      id: "b72",
      name: "Dolce&Gabbana",
      slug: "dolce-gabbana",
      tier: "DESIGNER",
    });
    const hits = searchCatalog([catalogFragrance], "light blue");
    expect(hits).toHaveLength(1);
    expect(hits[0].fragrance.id).toBe("485");
  });
});
