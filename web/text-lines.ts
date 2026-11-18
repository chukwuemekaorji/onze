/** finds the visual lines of wrapped text, for revealing it line by line */

export interface LineBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * one box per word or fragment in, one box per line out. a box whose middle
 * falls inside the current line's band joins it, which copes with bold words
 * sitting a pixel higher. results are relative to origin, top to bottom
 */
export function groupLineRects(
  rects: readonly RectLike[],
  origin: { left: number; top: number },
): LineBox[] {
  const sorted = rects
    .filter((r) => r.right > r.left && r.bottom > r.top)
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const lines: RectLike[] = [];
  for (const rect of sorted) {
    const middle = (rect.top + rect.bottom) / 2;
    const current = lines.at(-1);
    if (current && middle >= current.top && middle <= current.bottom) {
      current.left = Math.min(current.left, rect.left);
      current.right = Math.max(current.right, rect.right);
      current.top = Math.min(current.top, rect.top);
      current.bottom = Math.max(current.bottom, rect.bottom);
    } else {
      lines.push({ ...rect });
    }
  }

  return lines.map((line) => ({
    left: line.left - origin.left,
    top: line.top - origin.top,
    width: line.right - line.left,
    height: line.bottom - line.top,
  }));
}

export const WORD_CLASS = 'text-word';

/**
 * wraps each word of already-escaped html in a span, leaving tags alone, so
 * words can be measured. safe on renderMarkdownLite output, where the only
 * angle brackets are its own tags
 */
export function wrapWords(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part.replace(
            /[^\s]+/g,
            (word) => `<span class="${WORD_CLASS}">${word}</span>`,
          ),
    )
    .join('');
}

/**
 * the line boxes of wrapped words, relative to their offset parent. offsets
 * are layout positions, so a rotated or animating ancestor doesn't skew them
 * the way getClientRects would
 */
export function measureWordLines(container: HTMLElement): LineBox[] {
  const words = [...container.querySelectorAll<HTMLElement>(`.${WORD_CLASS}`)];
  return groupLineRects(
    words.map((word) => ({
      left: word.offsetLeft,
      top: word.offsetTop,
      right: word.offsetLeft + word.offsetWidth,
      bottom: word.offsetTop + word.offsetHeight,
    })),
    { left: 0, top: 0 },
  );
}
