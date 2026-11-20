import { describe, expect, it } from 'vitest';
import {
  leaguePriorFrom,
  playFeatures,
  pointsFeatures,
  basePoints,
  expectedDefensiveContributionPoints,
  projectPlayer,
  shrink,
  summariseSeason,
} from '../../lib/analysis/projection.js';
import type {
  LeaguePrior,
  MatchRecord,
  ProjectionInput,
  ProjectionWeights,
} from '../../lib/analysis/projection.js';
import { PROJECTION_WEIGHTS } from '../../lib/analysis/projection-weights.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

const LEAGUE: LeaguePrior = {
  pointsPerAppearance: { GK: 3, DEF: 3, MID: 3, FWD: 3 },
  minutesPerAppearance: { GK: 90, DEF: 80, MID: 70, FWD: 70 },
  expectedGoalsPer90: { GK: 0, DEF: 0.05, MID: 0.15, FWD: 0.35 },
  expectedAssistsPer90: { GK: 0, DEF: 0.05, MID: 0.15, FWD: 0.1 },
  defensiveContributionPer90: { GK: 0, DEF: 9, MID: 7, FWD: 4 },
  appearanceShare: 0.5,
  startShare: 0.4,
};

/** weights that make the arithmetic easy to follow by hand */
const SIMPLE_WEIGHTS: ProjectionWeights = {
  chanceOfPlaying: {
    intercept: 0,
    recentStartShare: 0,
    recentAppearanceShare: 0,
    seasonAppearanceShare: 0,
    priceMillions: 0,
  },
  pointsIfPlaying: {
    goalkeeper: 0,
    defender: 0,
    midfielder: 1,
    forward: 0,
    seasonPointsPerAppearance: 1,
    formPointsPerAppearance: 0,
    lastThreePointsPerAppearance: 0,
    attackingPointsPerAppearance: 0,
    priceMillions: 0,
    defensiveFixtureDifficulty: 0,
    attackingFixtureDifficulty: -1,
    home: 0.5,
  },
};

function matches(points: number[], minutes = 90): MatchRecord[] {
  return points.map((totalPoints, index) =>
    makeRow({ gameweek: index + 1, totalPoints, minutes, starts: minutes > 0 ? 1 : 0 }),
  );
}

const NEW_TO_THE_LEAGUE = summariseSeason([], 'MID');

function input(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    season: '2024-25',
    position: 'MID',
    nowCost: 80,
    deadline: '2024-10-19T11:30:00Z',
    fixtures: [{ fixtureDifficulty: 3, wasHome: false }],
    thisSeason: matches([6, 6, 6, 6]),
    lastSeason: summariseSeason(matches(new Array<number>(30).fill(5)), 'MID'),
    league: LEAGUE,
    ...overrides,
  };
}

describe('shrink', () => {
  it("blends a player's own numbers with the prior by count", () => {
    expect(shrink(0, 0, 3, 4)).toBe(3);
    expect(shrink(24, 4, 3, 4)).toBe(4.5);
  });
});

describe('projectPlayer', () => {
  it('is chance of playing times points if playing, with fixture and home terms', () => {
    // chance = logistic(0) = 0.5; season = (24 + 4 x prior) / 8, prior from 30 fives
    const prior = shrink(150, 30, 3, 4);
    const season = shrink(24, 4, prior, 4);

    const away = projectPlayer(input(), SIMPLE_WEIGHTS);
    const homeHard = projectPlayer(
      input({ fixtures: [{ fixtureDifficulty: 5, wasHome: true }] }),
      SIMPLE_WEIGHTS,
    );

    expect(away.chanceOfPlaying).toBe(0.5);
    expect(away.pointsIfPlaying[0]).toBeCloseTo(1 + season);
    expect(away.expectedPoints).toBeCloseTo(0.5 * (1 + season));
    expect(homeHard.pointsIfPlaying[0]).toBeCloseTo(1 + season - 2 + 0.5);
  });

  it('sums a double gameweek and gives a blank 0', () => {
    const one = projectPlayer(input(), SIMPLE_WEIGHTS).expectedPoints;
    const double = projectPlayer(
      input({
        fixtures: [
          { fixtureDifficulty: 3, wasHome: false },
          { fixtureDifficulty: 3, wasHome: false },
        ],
      }),
      SIMPLE_WEIGHTS,
    );
    const blank = projectPlayer(input({ fixtures: [] }), SIMPLE_WEIGHTS);

    expect(double.expectedPoints).toBeCloseTo(2 * one);
    expect(blank.expectedPoints).toBe(0);
  });

  it('starts gameweek 1 from last season, and a new arrival from the league average', () => {
    const proven = pointsFeatures(input({ thisSeason: [] }))[0];
    const newcomer = pointsFeatures(
      input({ thisSeason: [], lastSeason: NEW_TO_THE_LEAGUE }),
    )[0];

    expect(proven?.seasonPointsPerAppearance).toBeCloseTo(shrink(150, 30, 3, 4));
    expect(newcomer?.seasonPointsPerAppearance).toBe(3);
    expect(
      playFeatures(input({ thisSeason: [], lastSeason: NEW_TO_THE_LEAGUE }))
        .seasonAppearanceShare,
    ).toBe(0.5);
  });

  it('never projects negative points, even with a very hard fixture', () => {
    const projection = projectPlayer(
      input({
        fixtures: [{ fixtureDifficulty: 5, wasHome: false }],
        thisSeason: matches([0]),
      }),
      {
        ...SIMPLE_WEIGHTS,
        pointsIfPlaying: {
          ...SIMPLE_WEIGHTS.pointsIfPlaying,
          attackingFixtureDifficulty: -50,
        },
      },
    );

    expect(projection.pointsIfPlaying[0]).toBe(0);
  });

  it('with the fitted weights, ranks a nailed starter above a benched player', () => {
    const nailed = projectPlayer(input(), PROJECTION_WEIGHTS);
    const benched = projectPlayer(
      input({ thisSeason: [...matches([6, 6]), ...matches([0, 0, 0], 0)] }),
      PROJECTION_WEIGHTS,
    );

    expect(nailed.chanceOfPlaying).toBeGreaterThan(0.8);
    expect(benched.chanceOfPlaying).toBeLessThan(0.3);
    expect(nailed.expectedPoints).toBeGreaterThan(benched.expectedPoints);
  });
});

describe('leaguePriorFrom', () => {
  it('averages last season by position, over appearances only', () => {
    const prior = leaguePriorFrom([
      makeRow({ position: 'FWD', totalPoints: 8, minutes: 90, expectedGoals: 0.9 }),
      makeRow({ position: 'FWD', totalPoints: 2, minutes: 90, expectedGoals: 0.1 }),
      makeRow({ position: 'FWD', totalPoints: 0, minutes: 0, starts: 0 }),
    ]);

    expect(prior.pointsPerAppearance.FWD).toBe(5);
    expect(prior.expectedGoalsPer90.FWD).toBeCloseTo(0.5);
    expect(prior.appearanceShare).toBeCloseTo(2 / 3);
  });

  it('fails loudly with no last season to learn from', () => {
    expect(() => leaguePriorFrom([])).toThrow("needs last season's rows");
  });
});

describe('defensive contributions', () => {
  function defender(count: number, season = '2026-27'): ProjectionInput {
    return input({
      season,
      position: 'DEF',
      thisSeason: Array.from({ length: 6 }, (_, index) =>
        makeRow({ gameweek: index + 1, position: 'DEF', defensiveContribution: count }),
      ),
    });
  }

  it('adds 2 x the chance of reaching the count, only in seasons that score it', () => {
    const busy = projectPlayer(defender(14), SIMPLE_WEIGHTS);
    const quiet = projectPlayer(defender(3), SIMPLE_WEIGHTS);
    const before = projectPlayer(defender(14, '2024-25'), SIMPLE_WEIGHTS);

    expect(busy.defensiveContributionIfPlaying).toBeGreaterThan(1);
    expect(busy.defensiveContributionIfPlaying).toBeLessThanOrEqual(2);
    expect(quiet.defensiveContributionIfPlaying).toBeLessThan(0.2);
    expect(before.defensiveContributionIfPlaying).toBe(0);
    expect(busy.pointsIfPlaying[0]).toBeCloseTo(
      (before.pointsIfPlaying[0] ?? 0) + busy.defensiveContributionIfPlaying,
    );
  });

  it('never gives a keeper any, and starts a newcomer from the league rate', () => {
    expect(
      expectedDefensiveContributionPoints({ ...defender(20), position: 'GK' }),
    ).toBe(0);
    const newcomer = expectedDefensiveContributionPoints(
      input({ season: '2026-27', position: 'DEF', thisSeason: [] }),
    );
    // league rate 9 per 90 over the usual minutes: below the 10 needed, so under a coin flip
    expect(newcomer).toBeGreaterThan(0);
    expect(newcomer).toBeLessThan(1);
  });

  it('takes the points out of past totals, so the fitted part never counts them twice', () => {
    const scored = makeRow({
      position: 'DEF',
      totalPoints: 8,
      defensiveContribution: 11,
    });
    const unscored = makeRow({
      position: 'DEF',
      totalPoints: 8,
      defensiveContribution: null,
    });

    expect(basePoints(scored, 'DEF')).toBe(6);
    expect(basePoints(unscored, 'DEF')).toBe(8);
    expect(summariseSeason([scored, unscored], 'DEF').points).toBe(14);
  });
});

describe('summariseSeason', () => {
  it('keeps matches, appearances and the minutes behind each expected stat', () => {
    const summary = summariseSeason(
      [
        makeRow({ gameweek: 1, minutes: 90, expectedGoals: 0.5 }),
        makeRow({ gameweek: 2, minutes: 30, expectedGoals: null }),
        makeRow({ gameweek: 3, minutes: 0, starts: 0 }),
      ],
      'MID',
    );

    expect(summary).toMatchObject({
      matches: 3,
      appearances: 2,
      starts: 2,
      minutes: 120,
      expectedGoals: 0.5,
      expectedGoalsMinutes: 90,
    });
  });
});
