// RFC4180-style delimiter splitting for FragDB's pipe-delimited files.
// FragDB descriptions contain literal pipes, commas, and double quotes inside
// quoted fields, so a naive split() would corrupt rows. Newline chars inside
// quoted fields are supported per RFC4180; header included in output.
export function parseDelimitedCsv(content: string, delimiter: string): string[][] {
  throw new Error("not implemented: parseDelimitedCsv");
}
