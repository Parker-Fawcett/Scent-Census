// Ingest mapper for the free Fragrantica corpus snapshot (ledecanteur Kaggle
// dump; provenance and field contract in tests/fixtures/fragrantica-dump/).
// One JSON object per line. MAPS STRUCTURE ONLY: id/name/brand presence,
// numeric ranges, pyramid shapes; a bad row is dropped with a loud error so a
// silently skipped famous fragrance is impossible. Names, years, weights and
// strengths flow through unchanged: catalog facts from the community dataset
// are provenance-stamped downstream, never invented here.

export type DumpPosition = "TOP" | "HEART" | "BASE" | "ANY";

export interface DumpAccord {
  name: string;
  strength: number; // 0..100
}

export interface DumpPyramidNote {
  position: DumpPosition;
  name: string;
  weight: number; // 0..100 or fractional from the corpus
}

export interface MappedDumpFragrance {
  fid: number; // corpus id -> catalogueSourcePid prefix "fragrantica-"
  name: string;
  brandName: string; // preserved verbatim; house tiering is curation, not ingest
  slugBase: string;
  year: number | null;
  perfumers: string[]; // names in source order, lead first
  accords: DumpAccord[];
  pyramid: DumpPyramidNote[];
}

export interface DumpMappingError {
  fid: number | null;
  message: string;
}

export interface DumpLineResult {
  record: MappedDumpFragrance | null;
  error: DumpMappingError | undefined;
}

const UNKNOWN = "unknown"; // never an invented family value

function slugBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface RawAccord {
  name?: unknown;
  strength?: unknown;
}

interface RawNote {
  name?: unknown;
  slug?: unknown;
  weight?: unknown;
}

interface RawDump {
  id?: unknown;
  name?: unknown;
  brand?: unknown;
  year?: unknown;
  perfumers?: unknown;
  accords?: unknown;
  notes?: unknown;
}

export function mapDumpLine(line: string): DumpLineResult {
  let raw: RawDump;
  try {
    raw = JSON.parse(line) as RawDump;
  } catch {
    return {
      record: null,
      error: { fid: null, message: `line is not JSON: "${line.slice(0, 60)}"` },
    };
  }

  const fid = typeof raw.id === "number" && Number.isInteger(raw.id) && raw.id > 0 ? raw.id : null;
  if (fid === null) {
    return {
      record: null,
      error: { fid: null, message: "row has no usable numeric id" },
    };
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name === "") {
    return { record: null, error: { fid, message: "row has no name" } };
  }
  const brandName = typeof raw.brand === "string" ? raw.brand.trim() : "";
  if (brandName === "") {
    return { record: null, error: { fid, message: `row ${fid} has no brand` } };
  }

  if (raw.year !== undefined && raw.year !== null) {
    if (typeof raw.year !== "number" || !Number.isInteger(raw.year)) {
      return {
        record: null,
        error: { fid, message: `year is not an integer or null: "${String(raw.year)}"` },
      };
    }
  }
  const year = typeof raw.year === "number" ? raw.year : null;

  const perfumers: string[] = [];
  if (Array.isArray(raw.perfumers)) {
    for (const entry of raw.perfumers as Array<{ name?: unknown }>) {
      const value = typeof entry?.name === "string" ? entry.name.trim() : "";
      if (value !== "") perfumers.push(value);
    }
  }

  const accords: DumpAccord[] = [];
  if (raw.accords !== undefined && raw.accords !== null) {
    if (!Array.isArray(raw.accords)) {
      return { record: null, error: { fid, message: "accords field is not a list" } };
    }
    const seen = new Set<string>();
    for (const entry of raw.accords as RawAccord[]) {
      const accordName = typeof entry?.name === "string" ? entry.name.trim() : "";
      if (accordName === "") {
        return { record: null, error: { fid, message: `row ${fid} has an empty accord name` } };
      }
      if (typeof entry?.strength !== "number" || entry.strength < 0 || entry.strength > 100) {
        return {
          record: null,
          error: {
            fid,
            message: `accord strength out of range for ${accordName}: "${String(entry?.strength)}"`,
          },
        };
      }
      // accord list contains exact duplicates from the community carousel;
      // an accord cannot vote twice, strongest first wins
      if (seen.has(accordName)) continue;
      seen.add(accordName);
      accords.push({ name: accordName, strength: entry.strength });
    }
  }

  const pyramid: DumpPyramidNote[] = [];
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== "object" || Array.isArray(raw.notes)) {
      return { record: null, error: { fid, message: "notes field is not an object" } };
    }
    const notes = raw.notes as {
      tiered?: { top?: RawNote[]; middle?: RawNote[]; base?: RawNote[] } | null;
      flat?: RawNote[] | null;
    };
    const seen = new Set<string>();
    for (const key of ["top", "middle", "base"] as const) {
      const list = notes.tiered?.[key];
      if (list === undefined || list === null) continue;
      if (!Array.isArray(list)) {
        return { record: null, error: { fid, message: `notes.tiered.${key} is not a list` } };
      }
    }
    const positionByKey = {
      top: "TOP",
      middle: "HEART",
      base: "BASE",
    } as const;
    for (const key of ["top", "middle", "base"] as const) {
      const list = notes.tiered?.[key];
      for (const entry of list ?? []) {
        const noteName = typeof entry?.name === "string" ? entry.name.trim() : "";
        if (noteName === "") {
          return { record: null, error: { fid, message: `row ${fid} has an empty note name` } };
        }
        if (typeof noteName !== "string" || typeof entry?.weight !== "number" ||
          entry.weight < 0 || entry.weight > 100
        ) {
          return {
            record: null,
            error: {
              fid,
              message: `note weight out of range for ${noteName}: "${String(entry?.weight)}"`,
            },
          };
        }
        const position = positionByKey[key];
        const keySeen = `${position}|${noteName.toLowerCase()}`;
        if (seen.has(keySeen)) continue;
        seen.add(keySeen);
        pyramid.push({ position, name: noteName, weight: entry.weight });
      }
    }
    if (Array.isArray(notes.flat)) {
      for (const entry of notes.flat) {
        const noteName = typeof entry?.name === "string" ? entry.name.trim() : "";
        if (noteName === "") {
          return { record: null, error: { fid, message: `row ${fid} has an empty note name` } };
        }
        if (typeof entry?.weight !== "number" || entry.weight < 0 || entry.weight > 100) {
          return {
            record: null,
            error: {
              fid,
              message: `note weight out of range for ${noteName}: "${String(entry?.weight)}"`,
            },
          };
        }
        const key = `ANY|${noteName.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pyramid.push({ position: "ANY", name: noteName, weight: entry.weight });
      }
    }
  }

  void UNKNOWN;
  return {
    record: {
      fid,
      name,
      brandName,
      slugBase: slugBase(name),
      year,
      perfumers,
      accords,
      pyramid,
    },
    error: undefined,
  };
}
