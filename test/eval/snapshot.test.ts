import { describe, expect, it } from 'vitest';
import type { PlayerGameweekRow } from '../../lib/dataset/player-gameweek.js';
import { normaliseVaastavSeason } from '../../lib/dataset/normalise-vaastav.js';
import type { Projector } from '../../lib/eval/baselines.js';
import { runBacktest } from '../../lib/eval/backtest.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { HistoryView, SeasonRows } from '../../lib/eval/snapshot.js';
import { vaastavSlice } from '../helpers/dataset-slice.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

const FUTURE_POINTS = 999;

/** the real slice (gameweeks 1 and 2) with gameweek 2's points planted as an obvious tell */
function plantedSeasons(): SeasonRows[] {
  const real = normaliseVaastavSeason(vaastavSlice()).rows.map((row) =>
    row.gameweek === 2 ? { ...row, totalPoints: FUTURE_POINTS } : { ...row },
  );
  return [
    { season: '2023-24', rows: [makeRow({ season: '2023-24', gameweek: 38 })] },
    { season: '2024-25', rows: real },
    // a later season must never show up, even as "earlier seasons"
    {
      season: '2025-26',
      rows: [makeRow({ season: '2025-26', totalPoints: FUTURE_POINTS })],
    },
  ];
}

/** every row a model could possibly reach through the view */
function everythingReachable(
  history: HistoryView,
  playerIds: readonly number[],
): PlayerGameweekRow[] {
  return [
    ...history.thisSeason,
    ...history.earlierSeasons.flatMap((season) => season.rows),
    ...playerIds.flatMap((id) => history.playerRows(id)),
  ];
}

describe('buildGameweekCases', () => {
  it('makes one case per gameweek, each target with its own outcome', () => {
    const cases = buildGameweekCases(plantedSeasons(), '2024-25');

    expect(cases.map((entry) => entry.history.gameweek)).toEqual([1, 2]);
    for (const { targets, outcomes } of cases) {
      expect(targets).toHaveLength(100);
      for (const target of targets) expect(outcomes.has(target.playerId)).toBe(true);
    }
  });

  it('makes reading a future row impossible: the view holds nothing from gameweek N on', () => {
    for (const { history, targets } of buildGameweekCases(
      plantedSeasons(),
      '2024-25',
    )) {
      const reachable = everythingReachable(
        history,
        targets.map((target) => target.playerId),
      );
      for (const row of reachable) {
        const isEarlier =
          row.season < history.season ||
          (row.season === history.season && row.gameweek < history.gameweek);
        expect(isEarlier).toBe(true);
      }
      expect(reachable.some((row) => row.season === '2025-26')).toBe(false);
    }
  });

  it('stops a model that tries to cheat from ever seeing the planted future points', () => {
    const cheat: Projector = {
      id: 'cheat',
      label: 'Cheat',
      describe: 'returns the highest score it can find anywhere',
      project: (target, history) => {
        // walk the whole view, including through JSON, looking for the answer
        const dump = JSON.stringify(history) + JSON.stringify(target);
        if (dump.includes(String(FUTURE_POINTS))) return FUTURE_POINTS;
        const seen = everythingReachable(history, [target.playerId]);
        return Math.max(0, ...seen.map((row) => row.totalPoints));
      },
    };

    const run = runBacktest(buildGameweekCases(plantedSeasons(), '2024-25'), cheat);

    expect(run.projections.filter((p) => p.gameweek === 2)).toHaveLength(100);
    expect(run.projections.some((p) => p.projected === FUTURE_POINTS)).toBe(false);
  });

  it('hands a model no points, minutes or stats from the gameweek it predicts', () => {
    const [first] = buildGameweekCases(plantedSeasons(), '2024-25');
    const target = first?.targets[0];

    expect(Object.keys(target ?? {}).sort()).toEqual(
      [
        'fixtures',
        'gameweek',
        'leaky',
        'nowCost',
        'playerId',
        'playerName',
        'position',
        'season',
        'teamId',
      ].sort(),
    );
    expect(Object.keys(target?.fixtures[0] ?? {}).sort()).toEqual(
      [
        'fixtureDifficulty',
        'fixtureId',
        'kickoffTime',
        'opponentTeamId',
        'wasHome',
      ].sort(),
    );
  });

  it('freezes the view so a model cannot edit history either', () => {
    const [, second] = buildGameweekCases(plantedSeasons(), '2024-25');
    const history = second?.history;
    const row = history?.thisSeason[0];
    if (history === undefined || row === undefined) throw new Error('expected history');

    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.thisSeason)).toBe(true);
    expect(() => {
      (row as { totalPoints: number }).totalPoints = FUTURE_POINTS;
    }).toThrow(TypeError);
  });

  it('gives gameweek 1 no rows from this season, only earlier seasons', () => {
    const [first] = buildGameweekCases(plantedSeasons(), '2024-25');

    expect(first?.history.thisSeason).toHaveLength(0);
    expect(first?.history.earlierSeasons.map((season) => season.season)).toEqual([
      '2023-24',
    ]);
  });

  it('folds a double gameweek into one target: both fixtures, summed outcome, xP once', () => {
    const rows = [
      makeRow({ gameweek: 1, fixtureId: 1, totalPoints: 6, minutes: 90 }),
      makeRow({
        gameweek: 1,
        fixtureId: 2,
        totalPoints: 2,
        minutes: 60,
        opponentTeamId: 3,
      }),
    ];

    const [only] = buildGameweekCases([{ season: '2024-25', rows }], '2024-25');

    expect(only?.targets).toHaveLength(1);
    expect(only?.targets[0]?.fixtures).toHaveLength(2);
    expect(only?.targets[0]?.leaky.fplExpectedPoints).toBe(2.5);
    expect(only?.outcomes.get(1)).toEqual({ totalPoints: 8, minutes: 150 });
  });

  it('fails loudly when the season was never loaded', () => {
    expect(() => buildGameweekCases([], '2024-25')).toThrow(
      'no rows loaded for 2024-25',
    );
  });
});
