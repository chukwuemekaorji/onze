import { describe, expect, it } from 'vitest';
import { fitLogistic, fitRidge, solve } from '../../lib/eval/fit.js';
import { seededRandom } from '../../lib/eval/bootstrap.js';

type Key = 'one' | 'x';
const KEYS: readonly Key[] = ['one', 'x'];

describe('solve', () => {
  it('solves a small linear system', () => {
    const [a, b] = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    );
    expect(a).toBeCloseTo(1);
    expect(b).toBeCloseTo(3);
  });

  it('fails loudly when two features carry the same information', () => {
    expect(() =>
      solve(
        [
          [1, 1],
          [1, 1],
        ],
        [1, 1],
      ),
    ).toThrow('singular');
  });
});

describe('fitRidge', () => {
  const line = [0, 1, 2, 3, 4].map((x) => ({
    features: { one: 1, x },
    target: 1 + 2 * x,
  }));

  it('recovers an exact line with no penalty', () => {
    const weights = fitRidge(line, { keys: KEYS, penalty: 0, unpenalised: ['one'] });
    expect(weights.one).toBeCloseTo(1);
    expect(weights.x).toBeCloseTo(2);
  });

  it('shrinks penalised weights toward 0 and leaves the intercept free', () => {
    const weights = fitRidge(line, {
      keys: KEYS,
      penalty: 1_000,
      unpenalised: ['one'],
    });
    expect(Math.abs(weights.x)).toBeLessThan(0.1);
    // the intercept takes up the slack: close to the mean target
    expect(weights.one).toBeCloseTo(5, 0);
  });
});

describe('fitLogistic', () => {
  it('recovers the log-odds of simulated data', () => {
    const random = seededRandom(3);
    const examples = Array.from({ length: 4_000 }, () => {
      const x = random();
      const probability = 1 / (1 + Math.exp(-(-1 + 3 * x)));
      return { features: { one: 1, x }, target: random() < probability ? 1 : 0 };
    });

    const weights = fitLogistic(examples, { keys: KEYS, penalty: 0, unpenalised: [] });

    expect(weights.one).toBeCloseTo(-1, 0);
    expect(weights.x).toBeCloseTo(3, 0);
  });

  it('stays finite on perfectly separated data thanks to the penalty', () => {
    const examples = [0, 1, 2, 3].map((x) => ({
      features: { one: 1, x },
      target: x >= 2 ? 1 : 0,
    }));
    const weights = fitLogistic(examples, {
      keys: KEYS,
      penalty: 1,
      unpenalised: ['one'],
    });

    expect(Number.isFinite(weights.x)).toBe(true);
    expect(weights.x).toBeGreaterThan(0);
  });
});
