import { describe, expect, it } from 'vitest';
import { bootstrapInterval, quantile, seededRandom } from '../../lib/eval/bootstrap.js';

const OPTIONS = { resamples: 500, seed: 7, level: 0.95 };

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe('bootstrapInterval', () => {
  it('brackets the mean and is the same on every run', () => {
    const units = Array.from({ length: 40 }, (_, index) => index % 10);

    const first = bootstrapInterval(units, mean, OPTIONS);
    const second = bootstrapInterval(units, mean, OPTIONS);

    expect(first).toEqual(second);
    expect(first?.low).toBeLessThan(mean(units));
    expect(first?.high).toBeGreaterThan(mean(units));
  });

  it('collapses to the value when every unit is the same', () => {
    expect(bootstrapInterval([3, 3, 3], mean, OPTIONS)).toEqual({ low: 3, high: 3 });
  });

  it('is null with no units, or when the statistic is never defined', () => {
    expect(bootstrapInterval([], mean, OPTIONS)).toBeNull();
    expect(bootstrapInterval([1, 2], () => null, OPTIONS)).toBeNull();
  });
});

describe('seededRandom and quantile', () => {
  it('repeat for a seed and stay in [0, 1)', () => {
    const a = seededRandom(1);
    const b = seededRandom(1);
    for (let draw = 0; draw < 100; draw += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('interpolates between sorted values', () => {
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([4], 0.975)).toBe(4);
  });
});
