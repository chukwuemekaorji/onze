import { describe, expect, it } from 'vitest';
import type { GameweekResult, Projection } from '../../lib/eval/backtest.js';
import {
  captainDisagreement,
  haulParts,
  haulValue,
  pairedMetricDifference,
} from '../../lib/eval/compare.js';
import { scoreGameweek } from '../../lib/eval/metrics.js';

const OPTIONS = { resamples: 200, seed: 1, level: 0.95 };

function result(
  gameweek: number,
  projected: number[],
  actual: number[],
): GameweekResult {
  return {
    season: '2024-25',
    gameweek,
    players: projected.length,
    parts: scoreGameweek(
      projected.map((value, index) => ({
        position: 'MID',
        projected: value,
        actual: actual[index] ?? 0,
        minutes: 90,
      })),
    ),
  };
}

function projection(
  gameweek: number,
  playerId: number,
  projected: number,
  actual: number,
): Projection {
  return { season: '2024-25', gameweek, playerId, projected, actual, minutes: 90 };
}

describe('pairedMetricDifference', () => {
  it('is exactly 0 for a model against itself, interval and all', () => {
    const run = [1, 2, 3].map((gameweek) => result(gameweek, [3, 2, 1], [1, 5, 0]));
    const difference = pairedMetricDifference(run, run, 'captainRegret', OPTIONS);

    expect(difference.value).toBe(0);
    expect(difference.interval).toEqual({ low: 0, high: 0 });
  });

  it('sees a steady gap that separate intervals would blur', () => {
    // b's captain always scores 1 more, in gameweeks of wildly different size
    const a = [1, 2, 3, 4].map((gameweek) =>
      result(gameweek, [2, 1], [gameweek * 3, 20]),
    );
    const b = [1, 2, 3, 4].map((gameweek) =>
      result(gameweek, [2, 1], [gameweek * 3 + 1, 20]),
    );
    const difference = pairedMetricDifference(a, b, 'captainRegret', OPTIONS);

    expect(difference.value).toBeCloseTo(1);
    expect(difference.interval?.low).toBeCloseTo(1);
  });

  it('refuses runs over different gameweeks', () => {
    const a = [result(1, [1, 2], [1, 2])];
    const b = [result(2, [1, 2], [1, 2])];
    expect(() => pairedMetricDifference(a, b, 'maeAll', OPTIONS)).toThrow(
      'same gameweeks',
    );
  });
});

describe('haulParts', () => {
  it('gives a haul tied at the shortlist cut its share of the open places', () => {
    // 25 players all projected 2: 20 places shared by 25, one haul among them
    const gameweek = Array.from({ length: 25 }, (_, index) =>
      projection(1, index + 1, 2, index === 0 ? 12 : 1),
    );
    const parts = haulParts(gameweek);

    expect(haulValue('haulsShortlisted', parts)).toBeCloseTo(20 / 25);
    // the captain is everyone tied at the top: their average
    expect(haulValue('captainPoints', parts)).toBeCloseTo((12 + 24) / 25);
    expect(haulValue('captainHauled', parts)).toBeCloseTo(1 / 25);
  });

  it('is null with no hauls at all', () => {
    expect(
      haulValue('haulsShortlisted', haulParts([projection(1, 1, 5, 3)])),
    ).toBeNull();
  });
});

describe('captainDisagreement', () => {
  it("compares each side's captain only where they differ", () => {
    const a = [projection(1, 1, 9, 2), projection(1, 2, 5, 10), projection(2, 1, 9, 6)];
    const b = [projection(1, 1, 5, 2), projection(1, 2, 9, 10), projection(2, 1, 9, 6)];

    expect(captainDisagreement(a, b)).toEqual({
      gameweeks: 2,
      disagreements: 1,
      aPoints: 2,
      bPoints: 10,
    });
  });
});
