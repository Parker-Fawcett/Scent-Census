// RFC4180-style delimiter splitting for FragDB's pipe-delimited files.
// FragDB descriptions contain literal pipes, commas, and double quotes inside
// quoted fields, so a naive split() would corrupt rows. State machine, no
// dependencies; newline characters inside quoted fields are legal per RFC4180.

export function parseDelimitedCsv(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endRow = (): void => {
    row.push(field);
    field = "";
    rows.push(row);
    row = [];
  };

  if (content.length > 0) {
    while (i < content.length) {
      const c = content[i];
      if (inQuotes) {
        if (c === '"') {
          if (content[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i += 1;
          }
        } else {
          field += c;
          i += 1;
        }
      } else if (c === '"' && field.length === 0) {
        inQuotes = true;
        i += 1;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
        i += 1;
      } else if (c === "\n") {
        endRow();
        i += 1;
      } else if (c === "\r") {
        if (content[i + 1] === "\n") i += 1;
        endRow();
        i += 1;
      } else {
        field += c;
        i += 1;
      }
    }
    // final field/row without a trailing newline
    if (field.length > 0 || row.length > 0) endRow();
  }

  // drop trailing completely-empty row produced by a final newline
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === "") rows.pop();
  return rows;
}
