import { describe, expect, it } from 'vitest';
import { PROJECTION_WEIGHTS } from '../lib/analysis/projection-weights.js';
import { projectPlayer, summariseSeason } from '../lib/analysis/projection.js';
import type { LeaguePrior } from '../lib/analysis/projection.js';
import {
  StalePriorError,
  buildPlayerProjections,
  decodeSeasonSummary,
  encodeSeasonSummary,
  previousSeason,
  seasonOf,
} from '../lib/build-projections.js';
import type { LastSeasonPrior } from '../lib/build-projections.js';
import type { FplBootstrapStatic, FplElement, FplFixture } from '../lib/fpl-types.js';
import { makeRow } from './helpers/player-gameweek-row.js';

const LEAGUE: LeaguePrior = {
  pointsPerAppearance: { GK: 3.3, DEF: 2.6, MID: 2.7, FWD: 2.9 },
  minutesPerAppearance: { GK: 89, DEF: 78, MID: 64, FWD: 61 },
  expectedGoalsPer90: { GK: 0, DEF: 0.05, MID: 0.15, FWD: 0.35 },
  expectedAssistsPer90: { GK: 0.01, DEF: 0.05, MID: 0.12, FWD: 0.12 },
  defensiveContributionPer90: { GK: 0, DEF: 9, MID: 7, FWD: 3 },
  appearanceShare: 0.45,
  startShare: 0.35,
};

const LAST_SEASON = summariseSeason(
  Array.from({ length: 30 }, (_, index) =>
    makeRow({
      gameweek: index + 1,
      position: 'DEF',
      totalPoints: 4,
      defensiveContribution: 11,
    }),
  ),
  'DEF',
);

const PRIOR: LastSeasonPrior = {
  season: '2025-26',
  league: LEAGUE,
  players: {
    501: encodeSeasonSummary(LAST_SEASON),
    502: encodeSeasonSummary(LAST_SEASON),
  },
};

function element(id: number, overrides: Partial<FplElement> = {}): FplElement {
  return {
    id,
    code: 500 + id,
    web_name: `Player${id}`,
    first_name: 'Test',
    second_name: `Player${id}`,
    team: 1,
    element_type: 2,
    now_cost: 50,
    cost_change_event: 0,
    cost_change_start: 0,
    selected_by_percent: '1.0',
    form: '3.0',
    points_per_game: '3.0',
    ep_next: '3.0',
    ep_this: '3.0',
    total_points: 30,
    transfers_in_event: 0,
    transfers_out_event: 0,
    chance_of_playing_next_round: null,
    chance_of_playing_this_round: null,
    status: 'a',
    news: '',
    ...overrides,
  };
}

function bootstrap(elements: FplElement[], firstDeadline = '2026-08-15T10:00:00Z') {
  return {
    events: [
      {
        id: 1,
        name: 'Gameweek 1',
        deadline_time: firstDeadline,
        is_current: false,
        is_next: false,
        is_previous: true,
        finished: true,
      },
    ],
    teams: [],
    element_types: [],
    elements,
  } satisfies FplBootstrapStatic;
}

function fixture(id: number, event: number, home: number, away: number): FplFixture {
  return {
    id,
    event,
    team_h: home,
    team_a: away,
    team_h_difficulty: 3,
    team_a_difficulty: 4,
    finished: false,
    finished_provisional: false,
    kickoff_time: null,
  };
}

// team 1: one game in gameweek 11, two in 12, none in 13
const FIXTURES = [
  fixture(1, 11, 1, 2),
  fixture(2, 12, 2, 1),
  fixture(3, 12, 1, 3),
  fixture(4, 13, 2, 3),
];

const OPTIONS = {
  event: 11,
  deadline: '2026-11-21T11:00:00Z',
  horizonEvents: 3,
  history: new Map(),
  prior: PRIOR,
  weights: PROJECTION_WEIGHTS,
};

describe('season labels', () => {
  it('names the season from its first deadline, and the one before it', () => {
    expect(seasonOf(bootstrap([]))).toBe('2026-27');
    expect(previousSeason('2026-27')).toBe('2025-26');
    expect(previousSeason('2099-00')).toBe('2098-99');
  });
});

describe('season summary storage', () => {
  it('round-trips, and fails loudly on a row of the wrong length', () => {
    expect(decodeSeasonSummary(encodeSeasonSummary(LAST_SEASON))).toEqual(LAST_SEASON);
    expect(() => decodeSeasonSummary([1, 2, 3])).toThrow('has 11 numbers');
  });
});

describe('buildPlayerProjections', () => {
  it('runs the model for the planned gameweek, with defensive contributions in 2026-27', () => {
    const projections = buildPlayerProjections(
      bootstrap([element(1)]),
      FIXTURES,
      () => 'a',
      OPTIONS,
    );
    const projection = projections.get(1);
    const direct = projectPlayer(
      {
        season: '2026-27',
        position: 'DEF',
        nowCost: 50,
        deadline: OPTIONS.deadline,
        fixtures: [{ wasHome: true, fixtureDifficulty: 3 }],
        thisSeason: [],
        lastSeason: LAST_SEASON,
        league: LEAGUE,
      },
      PROJECTION_WEIGHTS,
    );

    expect(projection?.points).toBeCloseTo(direct.expectedPoints);
    expect(projection?.chanceOfPlaying).toBeCloseTo(direct.chanceOfPlaying);
    expect(projection?.defensiveContributionIfPlaying).toBeGreaterThan(0);
  });

  it('sums a double into the horizon and counts a blank as 0', () => {
    const projection = buildPlayerProjections(
      bootstrap([element(1)]),
      FIXTURES,
      () => 'a',
      OPTIONS,
    ).get(1);
    const oneWeek = buildPlayerProjections(
      bootstrap([element(1)]),
      FIXTURES,
      () => 'a',
      {
        ...OPTIONS,
        event: 12,
        horizonEvents: 1,
      },
    ).get(1);

    expect(oneWeek?.pointsIfPlaying).toBeGreaterThan(
      (projection?.pointsIfPlaying ?? 0) * 1.5,
    );
    // week 13 is a blank, so three weeks are gameweeks 11 and 12 alone
    expect(projection?.horizonPoints).toBeCloseTo(
      (projection?.points ?? 0) + (oneWeek?.points ?? 0),
    );
  });

  it("multiplies in fpl's team news: a 25% doubt and an injury", () => {
    const fit = buildPlayerProjections(
      bootstrap([element(1)]),
      FIXTURES,
      () => 'a',
      OPTIONS,
    ).get(1);
    const news = buildPlayerProjections(
      bootstrap([
        element(1, { status: 'd', chance_of_playing_next_round: 25 }),
        element(2, { status: 'i', chance_of_playing_next_round: 0 }),
      ]),
      FIXTURES,
      (e) => (e.status === 'd' ? 'd' : 'i'),
      OPTIONS,
    );

    expect(news.get(1)?.points).toBeCloseTo((fit?.points ?? 0) * 0.25);
    expect(news.get(1)?.chanceOfPlaying).toBeCloseTo(
      (fit?.chanceOfPlaying ?? 0) * 0.25,
    );
    // points if he plays is about the match, not the news
    expect(news.get(1)?.pointsIfPlaying).toBeCloseTo(fit?.pointsIfPlaying ?? 0);
    expect(news.get(2)?.points).toBe(0);
    expect(news.get(2)?.horizonPoints).toBe(0);
  });

  it('starts a player new to the league from the league prior', () => {
    const newcomer = buildPlayerProjections(
      bootstrap([element(1, { code: 9999 })]),
      FIXTURES,
      () => 'a',
      OPTIONS,
    ).get(1);
    expect(newcomer?.points).toBeGreaterThan(0);
  });

  it('refuses a prior from the wrong season instead of starting everyone from it', () => {
    expect(() =>
      buildPlayerProjections(
        bootstrap([element(1)], '2027-08-14T10:00:00Z'),
        FIXTURES,
        () => 'a',
        OPTIONS,
      ),
    ).toThrow(StalePriorError);
  });
});
