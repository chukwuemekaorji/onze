import { describe, expect, it } from 'vitest';
import { availabilityFactor } from '../../lib/analysis/availability.js';

describe('availabilityFactor', () => {
  it("uses fpl's percentage whenever it gives one", () => {
    expect(availabilityFactor('d', 75)).toBe(0.75);
    expect(availabilityFactor('a', 100)).toBe(1);
    expect(availabilityFactor('i', 0)).toBe(0);
  });

  it('reads the status when there is no percentage', () => {
    expect(availabilityFactor('a', null)).toBe(1);
    expect(availabilityFactor('d', null)).toBe(0.5);
    for (const status of ['i', 's', 'u', 'n'] as const) {
      expect(availabilityFactor(status, null)).toBe(0);
    }
  });

  it('keeps an out-of-range percentage between 0 and 1, and rejects junk', () => {
    expect(availabilityFactor('a', 150)).toBe(1);
    expect(availabilityFactor('a', -5)).toBe(0);
    expect(() => availabilityFactor('a', Number.NaN)).toThrow('must be a number');
  });
});
