import { describe, expect, it } from 'vitest';
import type { PlayerGameweekRow } from '../../lib/dataset/player-gameweek.js';
import {
  constantTwo,
  fplExpectedPoints,
  form,
  lastThreeGameweeks,
  pointsPerGame,
} from '../../lib/eval/baselines.js';
import type { Projector } from '../../lib/eval/baselines.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

/** project player 1's last gameweek in the rows, from everything before it */
function projectLast(projector: Projector, rows: PlayerGameweekRow[]): number | null {
  const cases = buildGameweekCases([{ season: '2024-25', rows }], '2024-25');
  const last = cases[cases.length - 1];
  const target = last?.targets.find((entry) => entry.playerId === 1);
  if (last === undefined || target === undefined)
    throw new Error('no target for player 1');
  return projector.project(target, last.history);
}

/** player 1 scores these points in gameweeks 1, 2, ...; then a gameweek to predict */
function season(
  points: number[],
  options: { minutes?: number[] } = {},
): PlayerGameweekRow[] {
  const played = points.map((totalPoints, index) =>
    makeRow({
      gameweek: index + 1,
      totalPoints,
      minutes: options.minutes?.[index] ?? 90,
    }),
  );
  return [...played, makeRow({ gameweek: points.length + 1, totalPoints: 50 })];
}

describe('baselines', () => {
  it('form averages the matches in the last 30 days only', () => {
    // a week apart: gameweeks 2 to 5 fall inside 30 days of gameweek 6
    expect(projectLast(form, season([20, 1, 2, 3, 6]))).toBe(3);
  });

  it('form is 0 for a player with rows but nothing in the last 30 days', () => {
    const rows = [
      makeRow({ gameweek: 1, totalPoints: 10 }),
      makeRow({ gameweek: 2, playerId: 2 }),
      makeRow({ gameweek: 3, playerId: 2 }),
      makeRow({ gameweek: 9, totalPoints: 1 }),
    ];

    expect(projectLast(form, rows)).toBe(0);
  });

  it("points per game counts only matches with minutes, as fpl's does", () => {
    expect(
      projectLast(pointsPerGame, season([6, 0, 3], { minutes: [90, 0, 90] })),
    ).toBe(4.5);
    expect(projectLast(pointsPerGame, season([0, 0], { minutes: [0, 0] }))).toBe(0);
  });

  it('last 3 gameweeks ignores anything older', () => {
    expect(projectLast(lastThreeGameweeks, season([30, 1, 2, 3]))).toBe(2);
  });

  it('every history baseline gives the 2-point prior to a player with no rows yet', () => {
    const rows = [makeRow({ gameweek: 1, totalPoints: 9 })];

    for (const projector of [form, pointsPerGame, lastThreeGameweeks]) {
      expect(projectLast(projector, rows)).toBe(2);
    }
  });

  it('scales by fixtures, so a double gameweek doubles the projection', () => {
    const rows = [
      makeRow({ gameweek: 1, totalPoints: 4 }),
      makeRow({ gameweek: 2, fixtureId: 201 }),
      makeRow({ gameweek: 2, fixtureId: 202, opponentTeamId: 3 }),
    ];

    expect(projectLast(pointsPerGame, rows)).toBe(8);
    expect(projectLast(constantTwo, rows)).toBe(4);
  });

  it("passes fpl's xP through, null where the source has none", () => {
    expect(projectLast(fplExpectedPoints, season([1]))).toBe(2.5);
    const live = [makeRow({ leaky: { fplExpectedPoints: null } })];
    expect(projectLast(fplExpectedPoints, live)).toBeNull();
  });
});
