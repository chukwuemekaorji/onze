import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TOKENS_CSS = readFileSync(
  new URL('../web/styles/tokens.css', import.meta.url),
  'utf8',
);

// wcag aa for body text
const MIN_TEXT_CONTRAST = 4.5;
// wcag aa for focus rings and other non-text ui
const MIN_UI_CONTRAST = 3;

function token(name: string): string {
  const match = TOKENS_CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match?.[1]) throw new Error(`no hex value for --${name} in tokens.css`);
  return match[1];
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) =>
    channelLuminance(parseInt(hex.slice(start, start + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens', () => {
  it.each([
    ['ink', 'paper'],
    ['ink', 'paper-card'],
    ['ink', 'highlighter'],
    ['ink-muted', 'paper'],
    ['ink-muted', 'paper-card'],
    ['marker-red-text', 'paper'],
    ['marker-red-text', 'paper-card'],
    ['paper', 'ink'],
    // the captain's c on the pitch
    ['paper', 'marker-red-text'],
  ])('%s text on %s meets aa', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });

  it('keeps the marker red visible enough for focus rings and strokes', () => {
    expect(contrast(token('marker-red'), token('paper'))).toBeGreaterThanOrEqual(
      MIN_UI_CONTRAST,
    );
  });

  it('computes known contrast ratios correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });

  it('fails loudly on a token that is missing', () => {
    expect(() => token('not-a-token')).toThrow(/no hex value/);
  });
});
