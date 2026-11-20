import { describe, expect, it } from 'vitest';
import { runBacktest, summariseRun } from '../../lib/eval/backtest.js';
import { constantTwo, fplExpectedPoints } from '../../lib/eval/baselines.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import {
  EVAL_SPLITS,
  LockedSeasonError,
  assertTestSeason,
  assertTuneSeasons,
} from '../../lib/eval/splits.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

const BOOTSTRAP = { resamples: 200, seed: 1, level: 0.95 };

function twoGameweeks() {
  return buildGameweekCases(
    [
      {
        season: '2024-25',
        rows: [
          makeRow({ gameweek: 1, playerId: 1, totalPoints: 2 }),
          makeRow({ gameweek: 1, playerId: 2, totalPoints: 6, minutes: 0 }),
          makeRow({ gameweek: 2, playerId: 1, totalPoints: 4 }),
          makeRow({ gameweek: 2, playerId: 2, leaky: { fplExpectedPoints: null } }),
        ],
      },
    ],
    '2024-25',
  );
}

describe('runBacktest', () => {
  it('scores every gameweek and records each projection next to the outcome', () => {
    const run = runBacktest(twoGameweeks(), constantTwo);

    expect(run.gameweeks.map((gameweek) => gameweek.players)).toEqual([2, 2]);
    expect(run.projections[1]).toMatchObject({
      playerId: 2,
      projected: 2,
      actual: 6,
      minutes: 0,
    });
    expect(run.gameweeks[0]?.parts.maePlayed).toEqual({ sum: 0, count: 1 });
  });

  it('leaves a gameweek unscored when the projector has nothing for someone', () => {
    const run = runBacktest(twoGameweeks(), fplExpectedPoints);

    expect(run.gameweeks).toHaveLength(1);
    expect(run.unscoredGameweeks).toBe(1);
  });

  it('summarises every metric with a value and an interval', () => {
    const summary = summariseRun(
      runBacktest(twoGameweeks(), constantTwo).gameweeks,
      BOOTSTRAP,
    );
    const mae = summary.find((metric) => metric.id === 'maeAll');

    expect(summary).toHaveLength(8);
    expect(mae?.value).toBeCloseTo((0 + 4 + 2 + 0) / 4);
    expect(mae?.interval).not.toBeNull();
  });
});

describe('splits', () => {
  it('lets the tune seasons through and refuses the locked test season', () => {
    expect(() => assertTuneSeasons([...EVAL_SPLITS.tune])).not.toThrow();
    expect(() => assertTuneSeasons(['2025-26'])).toThrow(LockedSeasonError);
    expect(() => assertTuneSeasons(['2026-27'])).toThrow('not a tune season');
  });

  it('lets only the test season into the final exam', () => {
    expect(() => assertTestSeason('2025-26')).not.toThrow();
    expect(() => assertTestSeason('2024-25')).toThrow('not the test season');
    expect(() => assertTestSeason('2026-27')).toThrow('not the test season');
  });
});
