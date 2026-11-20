import { describe, expect, it } from 'vitest';
import {
  leaguePriorFrom,
  playFeatures,
  pointsFeatures,
  projectPlayer,
  shrink,
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

function input(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    position: 'MID',
    nowCost: 80,
    deadline: '2024-10-19T11:30:00Z',
    fixtures: [{ fixtureDifficulty: 3, wasHome: false }],
    thisSeason: matches([6, 6, 6, 6]),
    lastSeason: matches(new Array<number>(30).fill(5)),
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
    const newcomer = pointsFeatures(input({ thisSeason: [], lastSeason: [] }))[0];

    expect(proven?.seasonPointsPerAppearance).toBeCloseTo(shrink(150, 30, 3, 4));
    expect(newcomer?.seasonPointsPerAppearance).toBe(3);
    expect(
      playFeatures(input({ thisSeason: [], lastSeason: [] })).seasonAppearanceShare,
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
