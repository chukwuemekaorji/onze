import { describe, expect, it } from 'vitest';
import {
  averageRanks,
  captainRegret,
  meanAbsoluteError,
  metricValue,
  rootMeanSquaredError,
  scoreGameweek,
  spearmanRankCorrelation,
  topProjectedMeanActual,
} from '../../lib/eval/metrics.js';
import type { ScoredPlayer } from '../../lib/eval/metrics.js';

function player(projected: number, actual: number, minutes = 90): ScoredPlayer {
  return { position: 'MID', projected, actual, minutes };
}

describe('error metrics', () => {
  it('compute mae and rmse', () => {
    const players = [player(2, 2), player(2, 6), player(5, 2)];

    expect(meanAbsoluteError(players)).toBeCloseTo(7 / 3);
    expect(rootMeanSquaredError(players)).toBeCloseTo(Math.sqrt(25 / 3));
  });

  it('return null with no players rather than 0', () => {
    expect(meanAbsoluteError([])).toBeNull();
    expect(rootMeanSquaredError([])).toBeNull();
  });
});

describe('spearmanRankCorrelation', () => {
  it('shares ranks between ties', () => {
    expect(averageRanks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });

  it('is 1 for the same order and -1 for the reverse', () => {
    expect(spearmanRankCorrelation([1, 2, 3], [10, 40, 90])).toBeCloseTo(1);
    expect(spearmanRankCorrelation([1, 2, 3], [9, 4, 1])).toBeCloseTo(-1);
  });

  it('is undefined (null) when a side is all equal or too short', () => {
    expect(spearmanRankCorrelation([2, 2, 2], [1, 5, 9])).toBeNull();
    expect(spearmanRankCorrelation([1], [1])).toBeNull();
  });

  it('rejects lists of different lengths', () => {
    expect(() => spearmanRankCorrelation([1, 2], [1])).toThrow('same length');
  });
});

describe('topProjectedMeanActual', () => {
  it('averages the actual points of the k highest projected', () => {
    const players = [player(9, 10), player(8, 4), player(1, 15), player(7, 1)];

    expect(topProjectedMeanActual(players, 2)).toBe(7);
  });

  it('gives tied players at the cut their mean instead of breaking ties by id', () => {
    // one clear pick (6 actual), then three tied for the last place (0, 3, 9)
    const players = [player(5, 6), player(2, 0), player(2, 3), player(2, 9)];

    expect(topProjectedMeanActual(players, 2)).toBe((6 + 4) / 2);
  });

  it('uses everyone when there are fewer than k, and null when there is nobody', () => {
    expect(topProjectedMeanActual([player(1, 4)], 5)).toBe(4);
    expect(topProjectedMeanActual([], 5)).toBeNull();
  });
});

describe('captainRegret', () => {
  it('is the best actual in the shortlist minus the captain', () => {
    const players = [player(9, 2), player(8, 12), player(1, 20)];

    expect(captainRegret(players, 2)).toBe(10);
  });

  it('is 0 when the captain was the best of the shortlist', () => {
    expect(captainRegret([player(9, 15), player(8, 2)], 20)).toBe(0);
  });

  it('averages a tied top pick and takes in everyone tied at the shortlist cut', () => {
    const players = [player(5, 2), player(5, 6), player(1, 7), player(1, 30)];

    // captain = mean(2, 6) = 4; cut at the 3rd player takes both 1s in
    expect(captainRegret(players, 3)).toBe(26);
    expect(captainRegret([], 20)).toBeNull();
  });
});

describe('scoreGameweek and metricValue', () => {
  it('keeps the played-only errors apart from everyone', () => {
    const parts = scoreGameweek([player(3, 5), player(2, 0, 0)]);

    expect(parts.maePlayed).toEqual({ sum: 2, count: 1 });
    expect(parts.maeAll).toEqual({ sum: 4, count: 2 });
  });

  it('pools gameweeks by player count, takes the root for rmse, and is null with nothing', () => {
    const one = scoreGameweek([player(0, 2)]);
    const two = scoreGameweek([player(0, 4), player(0, 4)]);

    expect(metricValue('maeAll', [one, two])).toBeCloseTo(10 / 3);
    expect(metricValue('rmseAll', [one, two])).toBeCloseTo(Math.sqrt(36 / 3));
    expect(metricValue('maePlayed', [scoreGameweek([player(1, 0, 0)])])).toBeNull();
  });

  it('averages spearman over each position in the gameweek', () => {
    const parts = scoreGameweek([
      { position: 'DEF', projected: 1, actual: 1, minutes: 90 },
      { position: 'DEF', projected: 2, actual: 2, minutes: 90 },
      { position: 'FWD', projected: 1, actual: 2, minutes: 90 },
      { position: 'FWD', projected: 2, actual: 1, minutes: 90 },
    ]);

    expect(parts.spearman.count).toBe(2);
    expect(metricValue('spearman', [parts])).toBeCloseTo(0);
  });

  it('keeps a played-only spearman that ignores who sat out', () => {
    const parts = scoreGameweek([
      { position: 'MID', projected: 3, actual: 2, minutes: 90 },
      { position: 'MID', projected: 2, actual: 9, minutes: 90 },
      { position: 'MID', projected: 1, actual: 0, minutes: 0 },
    ]);

    expect(metricValue('spearmanPlayed', [parts])).toBeCloseTo(-1);
    expect(metricValue('spearman', [parts])).toBeCloseTo(0.5);
  });
});
