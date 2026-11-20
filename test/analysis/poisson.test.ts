import { describe, expect, it } from 'vitest';
import {
  poissonAtLeast,
  poissonExpectedFloor,
  poissonZero,
} from '../../lib/analysis/poisson.js';

/** the same expectation by brute force over the probabilities */
function bruteExpectedFloor(mean: number, divisor: number): number {
  let total = 0;
  let probability = Math.exp(-mean);
  for (let count = 0; count < 200; count += 1) {
    if (count > 0) probability *= mean / count;
    total += probability * Math.floor(count / divisor);
  }
  return total;
}

describe('poissonZero', () => {
  it('is e to the minus mean', () => {
    expect(poissonZero(1)).toBeCloseTo(Math.exp(-1));
    expect(poissonZero(0)).toBe(1);
  });

  it('rejects a negative or infinite mean', () => {
    expect(() => poissonZero(-0.1)).toThrow('at least 0');
    expect(() => poissonZero(Number.POSITIVE_INFINITY)).toThrow('finite');
  });
});

describe('poissonExpectedFloor', () => {
  it('matches the brute force sum, and is below mean / divisor', () => {
    expect(poissonExpectedFloor(3.4, 3)).toBeCloseTo(bruteExpectedFloor(3.4, 3), 10);
    expect(poissonExpectedFloor(1.5, 2)).toBeCloseTo(bruteExpectedFloor(1.5, 2), 10);
    expect(poissonExpectedFloor(3.4, 3)).toBeLessThan(3.4 / 3);
  });

  it('is the mean itself with a divisor of 1, and 0 with a mean of 0', () => {
    expect(poissonExpectedFloor(2.2, 1)).toBeCloseTo(2.2, 10);
    expect(poissonExpectedFloor(0, 3)).toBe(0);
  });

  it('rejects a divisor that is not a whole number from 1', () => {
    expect(() => poissonExpectedFloor(1, 0)).toThrow('divisor');
    expect(() => poissonExpectedFloor(1, 2.5)).toThrow('divisor');
  });
});

describe('poissonAtLeast', () => {
  it('is one minus the chance of fewer', () => {
    // mean 2: p(0) + p(1) = 3 e^-2
    expect(poissonAtLeast(2, 2)).toBeCloseTo(1 - 3 * Math.exp(-2));
    expect(poissonAtLeast(5, 0)).toBe(1);
    expect(poissonAtLeast(0, 1)).toBe(0);
  });

  it('rejects a count that is not a whole number from 0', () => {
    expect(() => poissonAtLeast(1, -1)).toThrow('count');
    expect(() => poissonAtLeast(1, 1.5)).toThrow('count');
  });
});
