import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../lib/dataset/csv.js';
import { DatasetValidationError } from '../../lib/dataset/player-gameweek.js';

describe('parseCsv', () => {
  it('reads a header and one record per line', () => {
    expect(parseCsv('a,b\n1,2\n3,4\n', 'test')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('keeps commas, quotes and line breaks inside quoted cells', () => {
    const text = 'name,stats\nx,"[{\'a\': 1}, {\'b\': 2}]"\ny,"say ""hi""\nthere"\n';

    expect(parseCsv(text, 'test')).toEqual([
      { name: 'x', stats: "[{'a': 1}, {'b': 2}]" },
      { name: 'y', stats: 'say "hi"\nthere' },
    ]);
  });

  it('handles windows line endings, blank lines and no final newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n3,4', 'test')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('keeps empty cells as empty strings', () => {
    expect(parseCsv('a,b,c\n1,,3\n', 'test')).toEqual([{ a: '1', b: '', c: '3' }]);
  });

  it('fails loudly on a ragged row, naming the line', () => {
    expect(() => parseCsv('a,b\n1,2\n3\n', 'file.csv')).toThrow(
      new DatasetValidationError('file.csv line 3: 1 cells, header has 2'),
    );
  });

  it('fails loudly on an empty file or a cut-off quoted cell', () => {
    expect(() => parseCsv('', 'file.csv')).toThrow(DatasetValidationError);
    expect(() => parseCsv('a,b\n1,"unfinished', 'file.csv')).toThrow(
      'file ends inside a quoted cell',
    );
  });
});
