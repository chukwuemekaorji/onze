import { describe, expect, it } from 'vitest';
import { PROJECTION_WEIGHTS } from '../../lib/analysis/projection-weights.js';
import {
  projectionInputFor,
  projectionProjector,
  trainingSet,
} from '../../lib/eval/projection-projector.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { SeasonRows } from '../../lib/eval/snapshot.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

// the same person (code 777) has id 5 last season and id 9 this season
const SEASONS: SeasonRows[] = [
  {
    season: '2023-24',
    rows: [1, 2, 3].map((gameweek) =>
      makeRow({
        season: '2023-24',
        gameweek,
        playerId: 5,
        playerCode: 777,
        totalPoints: 7,
      }),
    ),
  },
  {
    season: '2024-25',
    rows: [
      makeRow({ gameweek: 1, playerId: 9, playerCode: 777, totalPoints: 1 }),
      makeRow({ gameweek: 2, playerId: 9, playerCode: 777, fixtureId: 201 }),
      makeRow({
        gameweek: 2,
        playerId: 9,
        playerCode: 777,
        fixtureId: 202,
        minutes: 0,
        totalPoints: 0,
      }),
    ],
  },
];

describe('projectionInputFor', () => {
  it('finds last season by stable code even though the id changed', () => {
    const [first] = buildGameweekCases(SEASONS, '2024-25');
    const target = first?.targets[0];
    if (first === undefined || target === undefined) throw new Error('expected a case');

    const input = projectionInputFor(target, first.history);

    expect(input.thisSeason).toHaveLength(0);
    expect(input.lastSeason).toHaveLength(3);
    expect(input.lastSeason.every((match) => match.totalPoints === 7)).toBe(true);
  });

  it('fails loudly when no last season was loaded', () => {
    const [first] = buildGameweekCases([SEASONS[1] as SeasonRows], '2024-25');
    const target = first?.targets[0];
    if (first === undefined || target === undefined) throw new Error('expected a case');

    expect(() => projectionInputFor(target, first.history)).toThrow('no last season');
  });
});

describe('trainingSet', () => {
  it('makes one play example per fixture and a points example per appearance', () => {
    const cases = buildGameweekCases(SEASONS, '2024-25');
    const set = trainingSet(cases, SEASONS[1]?.rows ?? []);

    expect(set.play.map((example) => example.target)).toEqual([1, 1, 0]);
    expect(set.points.map((example) => example.target)).toEqual([1, 2]);
  });
});

describe('projectionProjector', () => {
  it('projects through the harness with the fitted weights', () => {
    const [first] = buildGameweekCases(SEASONS, '2024-25');
    const target = first?.targets[0];
    if (first === undefined || target === undefined) throw new Error('expected a case');

    const projected = projectionProjector(PROJECTION_WEIGHTS, 'Model').project(
      target,
      first.history,
    );

    expect(projected).toBeGreaterThan(0);
  });
});
