import { describe, expect, it } from 'vitest';
import { groupLineRects, wrapWords } from '../web/text-lines.js';

const origin = { left: 100, top: 50 };
const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe('groupLineRects', () => {
  it('merges the fragments of one line, such as a bold word, into a single box', () => {
    const lines = groupLineRects(
      [rect(100, 50, 160, 70), rect(160, 51, 200, 69), rect(200, 50, 300, 70)],
      origin,
    );
    expect(lines).toEqual([{ left: 0, top: 0, width: 200, height: 20 }]);
  });

  it('splits wrapped text into lines, top to bottom, relative to the origin', () => {
    const lines = groupLineRects(
      [rect(100, 74, 220, 94), rect(100, 50, 340, 70), rect(100, 98, 180, 118)],
      origin,
    );
    expect(lines.map((line) => [line.top, line.width])).toEqual([
      [0, 240],
      [24, 120],
      [48, 80],
    ]);
  });

  it('ignores empty rects, such as the one a line break leaves behind', () => {
    expect(groupLineRects([rect(300, 50, 300, 70)], origin)).toEqual([]);
    expect(groupLineRects([], origin)).toEqual([]);
  });
});

describe('wrapWords', () => {
  it('wraps each word and leaves tags and spacing alone', () => {
    expect(wrapWords('Captain <strong>Salah</strong> now<br>x')).toBe(
      '<span class="text-word">Captain</span> <strong><span class="text-word">Salah</span></strong> <span class="text-word">now</span><br><span class="text-word">x</span>',
    );
  });

  it('keeps escaped entities inside their word', () => {
    expect(wrapWords('Q&amp;A &lt;3')).toBe(
      '<span class="text-word">Q&amp;A</span> <span class="text-word">&lt;3</span>',
    );
  });

  it('returns empty input unchanged', () => {
    expect(wrapWords('')).toBe('');
  });
});
