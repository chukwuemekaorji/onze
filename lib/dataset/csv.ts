import { DatasetValidationError } from './player-gameweek.js';

/**
 * parses rfc 4180 csv with a header row into one record per line. vaastav's
 * fixtures.csv quotes a stats column full of commas, so quotes must be honoured
 */
export function parseCsv(text: string, where: string): Record<string, string>[] {
  const lines = splitRecords(text, where);
  const header = lines.shift();
  if (header === undefined || header.length === 0) {
    throw new DatasetValidationError(`${where}: empty file, no header row`);
  }

  return lines.map((cells, index) => {
    if (cells.length !== header.length) {
      // +2: one for the header, one because people count lines from 1
      throw new DatasetValidationError(
        `${where} line ${index + 2}: ${cells.length} cells, header has ${header.length}`,
      );
    }
    const record: Record<string, string> = {};
    header.forEach((name, column) => {
      record[name] = cells[column] ?? '';
    });
    return record;
  });
}

function splitRecords(text: string, where: string): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      // \r\n counts as one line break
      if (char === '\r' && text[index + 1] === '\n') index++;
      cells.push(cell);
      records.push(cells);
      cells = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  // a cut-off download ends inside a quoted cell
  if (quoted) {
    throw new DatasetValidationError(`${where}: file ends inside a quoted cell`);
  }
  // a last line with no trailing newline
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    records.push(cells);
  }
  // blank lines carry no data
  return records.filter((record) => !(record.length === 1 && record[0] === ''));
}
