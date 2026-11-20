import { describe, expect, it } from 'vitest';
import {
  bonusFeatures,
  eventLeaguePriorFrom,
  finishing,
  projectEvents,
} from '../../lib/analysis/event-projection.js';
import type {
  EventFixture,
  EventInput,
  EventLeaguePrior,
  EventWeights,
} from '../../lib/analysis/event-projection.js';
import { EVENT_WEIGHTS } from '../../lib/analysis/event-weights.js';
import { poissonExpectedFloor } from '../../lib/analysis/poisson.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

const LEAGUE: EventLeaguePrior = {
  pointsPerAppearance: { GK: 3, DEF: 3, MID: 3, FWD: 3 },
  minutesPerAppearance: { GK: 90, DEF: 80, MID: 70, FWD: 70 },
  expectedGoalsPer90: { GK: 0, DEF: 0.06, MID: 0.3, FWD: 0.45 },
  expectedAssistsPer90: { GK: 0, DEF: 0.06, MID: 0.15, FWD: 0.15 },
  appearanceShare: 0.5,
  startShare: 0.4,
  keeperSavesPer90: 3,
};

/** every logistic at 0 (a coin flip), no scaling, bonus and other at 0: easy to follow */
const SIMPLE: EventWeights = {
  chanceOfPlaying: {
    intercept: 0,
    recentStartShare: 0,
    recentAppearanceShare: 0,
    seasonAppearanceShare: 0,
    priceMillions: 0,
  },
  fullGame: {
    intercept: 0,
    recentStartShare: 0,
    recentAppearanceShare: 0,
    seasonAppearanceShare: 0,
    priceMillions: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  },
  scales: { goals: 1, assists: 1, saves: 1, goalsConceded: 1, cleanSheet: 1 },
  // a 60+ appearance is 90 minutes, a short one 30: expected minutes 60
  minutes: { full: 90, short: 30 },
  finishingStrength: 20,
  bonus: {
    appearance: 0,
    fullGame: 0,
    goals: 0,
    assists: 0,
    defensiveCleanSheet: 0,
    saves: 0,
    defensiveGoalsConceded: 0,
  },
  otherPoints: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
};

const AVERAGE_FIXTURE: EventFixture = {
  fixtureDifficulty: 3,
  wasHome: true,
  scoringMultiplier: 1,
  opponentAttackMultiplier: 1,
  expectedGoalsAgainst: 1.2,
};

/** a newcomer with no history: every rate is the league's */
function input(overrides: Partial<EventInput> = {}): EventInput {
  return {
    position: 'MID',
    nowCost: 60,
    deadline: '2024-10-19T11:30:00Z',
    fixtures: [AVERAGE_FIXTURE],
    thisSeason: [],
    lastSeason: [],
    league: LEAGUE,
    ...overrides,
  };
}

describe('projectEvents', () => {
  it("puts each expected event through fpl's rules", () => {
    const projection = projectEvents(input(), SIMPLE);
    const fixture = projection.fixtures[0];

    // 60 expected minutes: two thirds of a match
    expect(fixture?.expectedMinutes).toBe(60);
    expect(fixture?.goals).toBeCloseTo(0.3 * (2 / 3));
    expect(fixture?.points.goals).toBeCloseTo(0.2 * 5);
    expect(fixture?.points.assists).toBeCloseTo(0.1 * 3);
    // half the time 60+ (2 points), half a cameo (1 point)
    expect(fixture?.points.appearance).toBeCloseTo(1.5);
    // a clean sheet needs 60+ minutes: half x e^-1.2 x 1 point for a midfielder
    expect(fixture?.points.cleanSheet).toBeCloseTo(0.5 * Math.exp(-1.2));
    expect(projection.expectedPoints).toBeCloseTo(
      0.5 * (1.5 + 1 + 0.3 + 0.5 * Math.exp(-1.2)),
    );
  });

  it('charges goals conceded to defenders only, and saves to keepers only', () => {
    const defender = projectEvents(input({ position: 'DEF' }), SIMPLE).fixtures[0];
    const keeper = projectEvents(input({ position: 'GK' }), SIMPLE).fixtures[0];
    const forward = projectEvents(input({ position: 'FWD' }), SIMPLE).fixtures[0];

    // -1 per 2 conceded, exact on the poisson for a full game and a cameo
    expect(defender?.points.goalsConceded).toBeCloseTo(
      -(0.5 * poissonExpectedFloor(1.2, 2) + 0.5 * poissonExpectedFloor(0.4, 2)),
    );
    expect(defender?.points.saves).toBe(0);
    expect(keeper?.points.saves).toBeCloseTo(
      0.5 * poissonExpectedFloor(3, 3) + 0.5 * poissonExpectedFloor(1, 3),
    );
    expect(forward?.points.goalsConceded).toBe(0);
    expect(forward?.points.cleanSheet).toBe(0);
  });

  it('sums a double gameweek and gives a blank 0', () => {
    const one = projectEvents(input(), SIMPLE).expectedPoints;
    const double = projectEvents(
      input({ fixtures: [AVERAGE_FIXTURE, AVERAGE_FIXTURE] }),
      SIMPLE,
    ).expectedPoints;

    expect(double).toBeCloseTo(2 * one);
    expect(projectEvents(input({ fixtures: [] }), SIMPLE).expectedPoints).toBe(0);
  });

  it('moves with the fixture: a leaky opponent helps attackers, a strong one hurts defenders', () => {
    const easy = { ...AVERAGE_FIXTURE, scoringMultiplier: 1.5 };
    const hard = { ...AVERAGE_FIXTURE, expectedGoalsAgainst: 2.4 };

    expect(
      projectEvents(input({ fixtures: [easy] }), SIMPLE).fixtures[0]?.goals,
    ).toBeCloseTo(0.3 * (2 / 3) * 1.5);
    expect(
      projectEvents(input({ position: 'DEF', fixtures: [hard] }), SIMPLE)
        .expectedPoints,
    ).toBeLessThan(projectEvents(input({ position: 'DEF' }), SIMPLE).expectedPoints);
  });

  it('starts a player with history from their own last season', () => {
    const scorer = Array.from({ length: 30 }, (_, index) =>
      makeRow({
        gameweek: index + 1,
        position: 'FWD',
        expectedGoals: 0.9,
        goalsScored: 1,
      }),
    );
    const proven = projectEvents(
      input({ position: 'FWD', lastSeason: scorer }),
      SIMPLE,
    );
    const newcomer = projectEvents(input({ position: 'FWD' }), SIMPLE);

    expect(proven.fixtures[0]?.goals ?? 0).toBeGreaterThan(
      2 * (newcomer.fixtures[0]?.goals ?? 0),
    );
  });

  it('fails loudly on an impossible fixture', () => {
    expect(() =>
      projectEvents(
        input({ fixtures: [{ ...AVERAGE_FIXTURE, expectedGoalsAgainst: -1 }] }),
        SIMPLE,
      ),
    ).toThrow('at least 0');
  });

  it('with the fitted numbers, ranks a nailed starter above a benched player', () => {
    const starts = (minutes: number) =>
      Array.from({ length: 5 }, (_, index) =>
        makeRow({ gameweek: index + 1, minutes, starts: minutes > 0 ? 1 : 0 }),
      );
    const nailed = projectEvents(input({ thisSeason: starts(90) }), EVENT_WEIGHTS);
    const benched = projectEvents(input({ thisSeason: starts(0) }), EVENT_WEIGHTS);

    expect(nailed.fullGameChance).toBeGreaterThan(0.8);
    expect(nailed.expectedPoints).toBeGreaterThan(benched.expectedPoints);
  });
});

describe('finishing', () => {
  it('shrinks goals per xg toward 1 by the strength', () => {
    expect(finishing(15, 10, 20)).toBeCloseTo(35 / 30);
    expect(finishing(0, 0, 20)).toBe(1);
  });
});

describe('bonusFeatures', () => {
  it('only counts clean sheets and goals conceded for keepers and defenders, saves for keepers', () => {
    const events = {
      fullGame: 1,
      goals: 1,
      assists: 0,
      cleanSheet: 1,
      saves: 4,
      goalsConceded: 0,
    };
    expect(bonusFeatures('MID', events)).toMatchObject({
      defensiveCleanSheet: 0,
      saves: 0,
      goals: 1,
    });
    expect(bonusFeatures('GK', events)).toMatchObject({
      defensiveCleanSheet: 1,
      saves: 4,
    });
  });
});

describe('eventLeaguePriorFrom', () => {
  it("adds keepers' saves per 90 to the league prior", () => {
    const prior = eventLeaguePriorFrom([
      makeRow({ position: 'GK', minutes: 90, saves: 4 }),
      makeRow({ position: 'GK', minutes: 90, saves: 2 }),
      makeRow({ position: 'DEF', minutes: 90, saves: 0 }),
    ]);
    expect(prior.keeperSavesPer90).toBeCloseTo(3);
  });

  it('fails loudly with no rows', () => {
    expect(() => eventLeaguePriorFrom([])).toThrow("needs last season's rows");
  });
});
