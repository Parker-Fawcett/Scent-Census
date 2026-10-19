// FragDB -> Scent Census mapping (M1 ingest contract). Source of the shape:
// scripts/ingest/samples (real FragDB sample files, committed). The mapper is
// pure: file contents in, records plus collected errors out. It validates
// STRUCTURE (id shapes, numeric ranges, pyramid labels) and fails loud on
// garbage, but does NOT attempt referential resolution: note/accord/perfumer
// ids stay as pids and Postgres foreign keys enforce existence at insert time,
// because the sample previews are each 10-row windows and never cross-resolve.
// Rows with structural problems are excluded from records and explained in
// errors; a silently skipped famous fragrance is an onboarding hole.

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

export function parseDelimitedCsv(content: string, delimiter: string): string[][] {
  throw new Error("not implemented: parseDelimitedCsv");
}

export function mapFragDBCatalog(inputs: FragDBInputs): FragDBCatalog {
  throw new Error("not implemented: mapFragDBCatalog");
}

export function toMappedCatalogFragrance(
  mapped: MappedCatalogFragrance,
  house: { id: string; name: string; slug: string; tier: string },
): import("../../src/domain/types").CatalogFragrance {
  throw new Error("not implemented: toMappedCatalogFragrance");
}
