// FragDB -> Scent Census mapping (M1 ingest contract). Source of the shape:
// scripts/ingest/samples (real FragDB sample files, committed). The mapper is
// pure: file contents in, records plus collected errors out. It validates
// STRUCTURE (id shapes, numeric ranges, pyramid labels) and fails loud on
// garbage, but does NOT attempt referential resolution: note/accord/perfumer
// ids stay as pids and Postgres foreign keys enforce existence at insert time,
// because the sample previews are each 10-row windows and never cross-resolve.
// Rows with structural problems are excluded from records and explained in
// errors; a silently skipped famous fragrance is an onboarding hole.

import { parseDelimitedCsv } from "./csv";
import type { CatalogFragrance, CatalogHouse } from "../../src/domain/types";

export { parseDelimitedCsv } from "./csv";

export type PyramidPosition = "TOP" | "HEART" | "BASE";

export interface MappedPyramidNote {
  position: PyramidPosition;
  notePid: string;
  /** FragDB opacity 0..1 (how strongly the note shows in the pyramid) */
  opacity: number;
  /** FragDB raw weight (vote-scaled, not normalized) */
  weightRaw: number;
}

export interface MappedAccord {
  accordPid: string;
  /** FragDB accord strength 0..100 */
  strength: number;
}

export interface MappedCatalogFragrance {
  pid: string; // stable FragDB pid -> catalogueSourcePid
  name: string;
  slugBase: string; // slugging happens here; uniqueness is a DB-layer job
  housePid: string; // from the row's own "Name;pid" brand cell
  houseName: string;
  year: number | null;
  // FragDB has no clone edges; curation sets inspiredById upstream. Keeping
  // the field null here stops anyone mistaking the pipe for clone data.
  inspiredById: null;
  accords: MappedAccord[];
  perfumers: string[]; // perfumer pids, from "Name;pid" cells
  pyramid: MappedPyramidNote[];
}

export interface MappingError {
  pid: string; // "" when the row could not even be identified
  message: string;
}

export interface FragDBCatalog {
  records: MappedCatalogFragrance[];
  errors: MappingError[];
}

export interface FragDBInputs {
  fragrancesCsv: string;
  notesCsv: string;
  accordsCsv: string;
}

const PYRAMID_RE = /^top\(([^()]*)\)middle\(([^()]*)\)base\(([^()]*)\)$/i;
const PYRAMID_TOKEN_RE = /^([a-z]+\d+),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/i;
const ACCORD_TOKEN_RE = /^([a-z]+\d+):(\d+(?:\.\d+)?)$/;
const PID_RE = /^[a-z]*\d+$/i; // brand b72, note n2260, accord a24, fragrance 485
const POSITION_BY_SEGMENT: Record<string, PyramidPosition> = {
  top: "TOP",
  middle: "HEART",
  base: "BASE",
};

/** FragDB identity cell format: "Light Blue|485" with ";" before the pid. */
function splitNamePid(cell: string): { name: string; pid: string } | null {
  const lastSemi = cell.lastIndexOf(";");
  if (lastSemi <= 0 || lastSemi === cell.length - 1) return null;
  return { name: cell.slice(0, lastSemi), pid: cell.slice(lastSemi + 1) };
}

function slugBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type Parser<T> = (field: string, pid: string, errors: MappingError[]) => T | null;

const parsePyramid: Parser<MappedPyramidNote[]> = (field, pid, errors) => {
  if (field === "") return [];
  const match = field.match(PYRAMID_RE);
  if (!match) {
    errors.push({ pid, message: `unparseable pyramid: "${field.slice(0, 60)}"` });
    return null;
  }
  const notes: MappedPyramidNote[] = [];
  const seen = new Set<string>();
  const segments = ["top", "middle", "base"];
  for (let s = 0; s < 3; s += 1) {
    const segment = match[s + 1];
    if (segment === "") continue;
    for (const token of segment.split(";")) {
      const m = token.match(PYRAMID_TOKEN_RE);
      if (!m) {
        errors.push({ pid, message: `unparseable pyramid token: "${token.slice(0, 40)}"` });
        return null;
      }
      const [, notePid, opacity, weightRaw] = m;
      // FragDB emits exact duplicates (n1985 twice in Light Blue's top); a
      // note position cannot vote for itself twice, so keep the first
      const key = `${segments[s]}|${notePid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({
        position: POSITION_BY_SEGMENT[segments[s]],
        notePid,
        opacity: Number(opacity),
        weightRaw: Number(weightRaw),
      });
    }
  }
  return notes;
};

const parseAccords: Parser<MappedAccord[]> = (field, pid, errors) => {
  if (field === "") return [];
  const accords: MappedAccord[] = [];
  for (const token of field.split(";")) {
    if (token === "") continue;
    const m = token.match(ACCORD_TOKEN_RE);
    if (!m) {
      errors.push({ pid, message: `unparseable accord token: "${token.slice(0, 40)}"` });
      return null;
    }
    const strength = Number(m[2]);
    if (strength < 0 || strength > 100) {
      errors.push({ pid, message: `accord strength out of range: "${token.slice(0, 40)}"` });
      return null;
    }
    accords.push({ accordPid: m[1], strength });
  }
  return accords;
};

const parsePerfumers: Parser<string[]> = (field, pid, errors) => {
  if (field === "") return [];
  const perfumers: string[] = [];
  // cell format: "Dominique Ropion;p2;Laurent Bruyere;p48" — name;pid pairs
  // joined by the SAME separator, so consume strictly two tokens at a time
  const tokens = field.split(";");
  if (tokens.length % 2 !== 0) {
    errors.push({ pid, message: `perfumer cell does not pair names and pids: "${field.slice(0, 60)}"` });
    return null;
  }
  for (let i = 0; i < tokens.length; i += 2) {
    const perfumerPid = tokens[i + 1];
    if (!/^p\d+$/.test(perfumerPid)) {
      errors.push({ pid, message: `unparseable perfumer cell: "${field.slice(0, 40)}"` });
      return null;
    }
    perfumers.push(perfumerPid);
  }
  return perfumers;
};

export function mapFragDBCatalog(inputs: FragDBInputs): FragDBCatalog {
  const records: MappedCatalogFragrance[] = [];
  const errors: MappingError[] = [];
  const rows = parseDelimitedCsv(inputs.fragrancesCsv, "|");
  const header = rows[0] ?? [];
  const col = (name: string): number => header.indexOf(name);
  const C = {
    pid: col("pid"),
    name: col("name"),
    brand: col("brand"),
    year: col("year"),
    perfumers: col("perfumers"),
    accords: col("accords"),
    pyramid: col("notes_pyramid"),
  };

  for (const row of rows.slice(1)) {
    const pid = row[C.pid] ?? "";
    if (!PID_RE.test(pid)) {
      errors.push({ pid, message: "row has no usable pid" });
      continue;
    }
    const name = row[C.name] ?? "";
    if (name === "") {
      errors.push({ pid, message: "row has no name" });
      continue;
    }
    const brand = splitNamePid(row[C.brand] ?? "");
    if (!brand) {
      errors.push({ pid, message: `unparseable brand cell: "${row[C.brand]}"` });
      continue;
    }
    const yearRaw = row[C.year] ?? "";
    if (yearRaw !== "" && !/^\d{4}$/.test(yearRaw)) {
      errors.push({ pid, message: `non-numeric year: "${yearRaw.slice(0, 20)}"` });
      continue;
    }
    // scalar parsers push their own errors and null out the row on garbage
    const perfumers = parsePerfumers(row[C.perfumers] ?? "", pid, errors);
    const accords = parseAccords(row[C.accords] ?? "", pid, errors);
    const pyramid = parsePyramid(row[C.pyramid] ?? "", pid, errors);
    if (perfumers === null || accords === null || pyramid === null) continue;
    records.push({
      pid,
      name,
      slugBase: slugBase(name),
      housePid: brand.pid,
      houseName: brand.name,
      year: yearRaw === "" ? null : Number(yearRaw),
      inspiredById: null,
      perfumers,
      accords,
      pyramid,
    });
  }
  return { records, errors };
}

/** Domain projection of a mapped record: identity is the pid. Joined names
 * (note names, accord names) resolve from the Note/Accord tables when the
 * catalogue is built into Postgres; the pid-level data lives in the schema. */
export function toMappedCatalogFragrance(
  mapped: MappedCatalogFragrance,
  house: CatalogHouse,
): CatalogFragrance {
  return {
    id: mapped.pid,
    slug: mapped.slugBase,
    name: mapped.name,
    house,
    year: mapped.year,
    inspiredById: mapped.inspiredById,
    noteNames: [],
    accordNames: [],
  };
}
