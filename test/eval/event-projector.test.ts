import { describe, expect, it } from 'vitest';
import { EVENT_WEIGHTS } from '../../lib/analysis/event-weights.js';
import { calibrationByPosition } from '../../lib/eval/event-calibration.js';
import {
  eventInputFor,
  eventProjector,
  eventTrainingSet,
  fitScales,
  goalLogLoss,
} from '../../lib/eval/event-projector.js';
import type { AppearanceExample } from '../../lib/eval/event-projector.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { SeasonRows } from '../../lib/eval/snapshot.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

/**
 * arsenal (code 777) at home to villa (code 888) every week. ids and team ids
 * are renumbered between the seasons, as fpl does, so only codes and team
 * names join them
 */
function pair(
  season: string,
  gameweek: number,
  ids: [number, number],
  teamIds: [number, number],
) {
  return [
    makeRow({
      season,
      gameweek,
      playerId: ids[0],
      playerCode: 777,
      position: 'FWD',
      teamId: teamIds[0],
      teamName: 'Arsenal',
      opponentTeamId: teamIds[1],
      opponentTeamName: 'Aston Villa',
      wasHome: true,
      expectedGoals: 0.9,
      goalsScored: gameweek === 1 ? 1 : 0,
      totalPoints: gameweek === 1 ? 6 : 2,
    }),
    makeRow({
      season,
      gameweek,
      playerId: ids[1],
      playerCode: 888,
      position: 'DEF',
      teamId: teamIds[1],
      teamName: 'Aston Villa',
      opponentTeamId: teamIds[0],
      opponentTeamName: 'Arsenal',
      wasHome: false,
      expectedGoals: 0.3,
      goalsConceded: gameweek === 1 ? 1 : 0,
      // a yellow card in gameweek 2: a point the recorded events don't explain
      totalPoints: gameweek === 2 ? 1 : 2,
    }),
  ];
}

const SEASONS: SeasonRows[] = [
  {
    season: '2023-24',
    rows: [1, 2, 3, 4].flatMap((gameweek) => pair('2023-24', gameweek, [5, 6], [7, 8])),
  },
  {
    season: '2024-25',
    rows: [1, 2, 3].flatMap((gameweek) => pair('2024-25', gameweek, [9, 10], [1, 2])),
  },
];

function firstCase() {
  const [first] = buildGameweekCases(SEASONS, '2024-25');
  if (first === undefined) throw new Error('expected a case');
  return first;
}

describe('eventInputFor', () => {
  it('finds last season by code and team strength by name, though every id changed', () => {
    const { history, targets } = firstCase();
    const arsenal = targets.find((target) => target.teamName === 'Arsenal');
    const villa = targets.find((target) => target.teamName === 'Aston Villa');
    if (arsenal === undefined || villa === undefined) throw new Error('expected both');

    const attack = eventInputFor(arsenal, history);
    const defence = eventInputFor(villa, history);

    expect(attack.lastSeason.matches).toBe(4);
    // last season villa conceded 0.9 a match against a 0.6 average, and arsenal were at home
    expect(attack.fixtures[0]?.scoringMultiplier).toBeGreaterThan(1);
    expect(defence.fixtures[0]?.expectedGoalsAgainst).toBeGreaterThan(
      attack.fixtures[0]?.expectedGoalsAgainst ?? Infinity,
    );
  });

  it('fails loudly when no last season was loaded', () => {
    const [first] = buildGameweekCases([SEASONS[1] as SeasonRows], '2024-25');
    const target = first?.targets[0];
    if (first === undefined || target === undefined) throw new Error('expected a case');
    expect(() => eventInputFor(target, first.history)).toThrow('no last season');
  });
});

describe('eventTrainingSet', () => {
  it('keeps what the recorded events leave out, and one example per appearance', () => {
    const set = eventTrainingSet(
      buildGameweekCases(SEASONS, '2024-25'),
      SEASONS[1]?.rows ?? [],
    );

    expect(set.play).toHaveLength(6);
    expect(set.appearances).toHaveLength(6);
    expect(set.other.DEF).toEqual({ sum: -1, count: 3 });
    expect(set.other.FWD).toEqual({ sum: 0, count: 3 });
    expect(set.appearances.map((example) => example.actual.goals)).toContain(1);
  });
});

describe('eventProjector', () => {
  it('projects through the harness with the fitted numbers', () => {
    const { history, targets } = firstCase();
    const target = targets[0];
    if (target === undefined) throw new Error('expected a target');
    expect(
      eventProjector(EVENT_WEIGHTS, 'Events').project(target, history),
    ).toBeGreaterThan(0);
  });
});

function appearance(overrides: Partial<AppearanceExample> = {}): AppearanceExample {
  return {
    position: 'DEF',
    minutes: 90,
    expectedGoalsPer90: 0.1,
    evidence: { goals: 0, expectedGoals: 0 },
    rates: { goalsPer90: 0.1, assistsPer90: 0.1, savesPer90: 0 },
    fixture: {
      scoringMultiplier: 1,
      opponentAttackMultiplier: 1,
      expectedGoalsAgainst: Math.log(2),
    },
    actual: { goals: 0, assists: 0, saves: 0, goalsConceded: 1, cleanSheet: 0 },
    ...overrides,
  };
}

describe('fitScales', () => {
  it('is actual over predicted, and matches the clean sheets kept', () => {
    // a keeper's 10 full games at 0.1 xa each: 1 predicted, 2 real assists
    const examples = Array.from({ length: 10 }, (_, index) =>
      appearance({
        position: 'GK',
        rates: { goalsPer90: 0.1, assistsPer90: 0.1, savesPer90: 3 },
        actual: {
          goals: index === 0 ? 1 : 0,
          assists: index < 2 ? 1 : 0,
          saves: 3,
          goalsConceded: index % 2,
          // e^-ln2 = half the games predicted clean, and half were
          cleanSheet: index % 2 === 0 ? 1 : 0,
        },
      }),
    );

    const scales = fitScales(examples, 20);

    expect(scales.assists).toBeCloseTo(2);
    expect(scales.saves).toBeCloseTo(1);
    expect(scales.cleanSheet).toBeCloseTo(1, 3);
  });

  it('fails loudly when there is nothing to scale against', () => {
    expect(() => fitScales([], 20)).toThrow('no goals predicted');
    // an outfield-only set has no saves to learn from
    expect(() =>
      fitScales(
        [
          appearance({
            actual: { goals: 1, assists: 1, saves: 0, goalsConceded: 1, cleanSheet: 0 },
          }),
        ],
        20,
      ),
    ).toThrow('no saves predicted');
  });
});

describe('goalLogLoss', () => {
  it('rewards trusting finishing when finishing really differs between players', () => {
    // one player scores double their xg, the other half, again and again
    const sharp = appearance({
      evidence: { goals: 40, expectedGoals: 20 },
      actual: { goals: 1, assists: 0, saves: 0, goalsConceded: 0, cleanSheet: 0 },
      expectedGoalsPer90: 0.5,
    });
    const wasteful = appearance({
      evidence: { goals: 10, expectedGoals: 20 },
      actual: { goals: 0, assists: 0, saves: 0, goalsConceded: 0, cleanSheet: 0 },
      expectedGoalsPer90: 0.5,
    });
    const examples = [
      ...Array(20).fill(sharp),
      ...Array(20).fill(wasteful),
    ] as AppearanceExample[];

    expect(goalLogLoss(examples, 2)).toBeLessThan(goalLogLoss(examples, 1_000));
  });
});

describe('calibrationByPosition', () => {
  it('averages projected and actual points per event over the appearances', () => {
    const calibration = calibrationByPosition([
      {
        cases: buildGameweekCases(SEASONS, '2024-25'),
        seasonRows: SEASONS[1]?.rows ?? [],
        weights: EVENT_WEIGHTS,
      },
    ]);

    expect(calibration.FWD.appearances).toBe(3);
    expect(calibration.FWD.actual.appearance).toBe(2);
    expect(calibration.FWD.actual.goals).toBeCloseTo(4 / 3);
    expect(calibration.DEF.actual.other).toBeCloseTo(-1 / 3);
    expect(calibration.GK.appearances).toBe(0);
  });
});
