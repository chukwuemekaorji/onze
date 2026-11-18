import { describe, expect, it } from 'vitest';
import { stableTilt } from '../web/stable-tilt.js';

describe('stableTilt', () => {
  it('gives the same tilt for the same key every time', () => {
    expect(stableTilt('notepad', 1.2)).toBe(stableTilt('notepad', 1.2));
  });

  it('stays within the limit and varies between keys', () => {
    const tilts = [
      'notepad',
      'your-moves',
      'transfers-list',
      'chip-stamps',
      'price-alerts',
    ].map((key) => stableTilt(key, 1.2));
    for (const tilt of tilts) expect(Math.abs(tilt)).toBeLessThanOrEqual(1.2);
    expect(new Set(tilts).size).toBe(tilts.length);
  });

  it('handles an empty key and a zero limit', () => {
    expect(Math.abs(stableTilt('', 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(stableTilt('anything', 0))).toBe(0);
  });
});
