import { describe, expect, it } from 'vitest';
import { TWO_PART_SHARE } from '../lib/analysis/blend-weight.js';
import {
  projectEvents,
  summariseEventSeason,
} from '../lib/analysis/event-projection.js';
import type { EventLeaguePrior } from '../lib/analysis/event-projection.js';
import { EVENT_WEIGHTS } from '../lib/analysis/event-weights.js';
import { PROJECTION_WEIGHTS } from '../lib/analysis/projection-weights.js';
import { projectPlayer } from '../lib/analysis/projection.js';
import {
  fixtureGoalRates,
  summariseTeamSeason,
  teamStrengths,
} from '../lib/analysis/team-strength.js';
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

const LEAGUE: EventLeaguePrior = {
  pointsPerAppearance: { GK: 3.3, DEF: 2.6, MID: 2.7, FWD: 2.9 },
  minutesPerAppearance: { GK: 89, DEF: 78, MID: 64, FWD: 61 },
  expectedGoalsPer90: { GK: 0, DEF: 0.05, MID: 0.15, FWD: 0.35 },
  expectedAssistsPer90: { GK: 0.01, DEF: 0.05, MID: 0.12, FWD: 0.12 },
  defensiveContributionPer90: { GK: 0, DEF: 9, MID: 7, FWD: 3 },
  appearanceShare: 0.45,
  startShare: 0.35,
  keeperSavesPer90: 2.8,
};

// last season: arsenal strong, spurs and leeds weaker
const TEAMS = summariseTeamSeason([
  {
    teamName: 'Arsenal',
    wasHome: true,
    expectedGoalsFor: 2,
    expectedGoalsAgainst: 0.8,
  },
  { teamName: 'Spurs', wasHome: false, expectedGoalsFor: 0.8, expectedGoalsAgainst: 2 },
  {
    teamName: 'Leeds',
    wasHome: true,
    expectedGoalsFor: 1.2,
    expectedGoalsAgainst: 1.5,
  },
  {
    teamName: 'Spurs',
    wasHome: false,
    expectedGoalsFor: 1.5,
    expectedGoalsAgainst: 1.2,
  },
]);

const LAST_SEASON = summariseEventSeason(
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
  teams: TEAMS,
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
    teams: [
      { id: 1, name: 'Arsenal' },
      { id: 2, name: 'Spurs' },
      { id: 3, name: 'Leeds' },
    ] as FplBootstrapStatic['teams'],
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
  planEvents: 5,
  history: { players: new Map(), teamMatches: [] },
  prior: PRIOR,
  weights: {
    twoPart: PROJECTION_WEIGHTS,
    event: EVENT_WEIGHTS,
    twoPartShare: TWO_PART_SHARE,
  },
};

/** both models run directly on what the builder should hand them */
function direct(position: 'DEF' | 'MID') {
  const input = {
    season: '2026-27',
    position,
    nowCost: 50,
    deadline: OPTIONS.deadline,
    fixtures: [
      {
        wasHome: true,
        fixtureDifficulty: 3,
        ...fixtureGoalRates(teamStrengths([], TEAMS), 'Arsenal', 'Spurs', true),
      },
    ],
    thisSeason: [],
    lastSeason: LAST_SEASON,
    league: LEAGUE,
  };
  return {
    twoPart: projectPlayer(input, PROJECTION_WEIGHTS),
    event: projectEvents(input, EVENT_WEIGHTS),
  };
}

function withShare(twoPartShare: number) {
  return { ...OPTIONS, weights: { ...OPTIONS.weights, twoPartShare } };
}

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
    expect(() => decodeSeasonSummary([1, 2, 3])).toThrow('has 13 numbers');
  });
});

describe('buildPlayerProjections', () => {
  it('is the two-part model at share 1, the event model at 0, and a straight mix between', () => {
    const run = (share: number) =>
      buildPlayerProjections(
        bootstrap([element(1)]),
        FIXTURES,
        () => 'a',
        withShare(share),
      ).get(1);
    const { twoPart, event } = direct('DEF');

    expect(run(1)?.points).toBeCloseTo(twoPart.expectedPoints, 10);
    expect(run(0)?.points).toBeCloseTo(event.expectedPoints, 10);
    expect(run(TWO_PART_SHARE)?.points).toBeCloseTo(
      TWO_PART_SHARE * twoPart.expectedPoints +
        (1 - TWO_PART_SHARE) * event.expectedPoints,
      10,
    );
    expect(run(TWO_PART_SHARE)?.chanceOfPlaying).toBeCloseTo(
      TWO_PART_SHARE * twoPart.chanceOfPlaying +
        (1 - TWO_PART_SHARE) * event.chanceOfPlaying,
      10,
    );
  });

  it('predicts each of the next five weeks: the double summed, the blank 0', () => {
    const projection = buildPlayerProjections(
      bootstrap([element(1)]),
      FIXTURES,
      () => 'a',
      OPTIONS,
    ).get(1);
    const [eleven, twelve, thirteen, fourteen, fifteen] =
      projection?.weeklyPoints ?? [];

    expect(projection?.weeklyPoints).toHaveLength(5);
    expect(eleven).toBeCloseTo(projection?.points ?? -1, 10);
    // gameweek 12 is a double, 13 to 15 have no fixtures at all
    expect(twelve).toBeGreaterThan((eleven ?? 0) * 1.5);
    expect([thirteen, fourteen, fifteen]).toEqual([0, 0, 0]);
    expect(projection?.horizonPoints).toBeCloseTo((eleven ?? 0) + (twelve ?? 0), 10);
  });

  it('refuses a share outside 0 to 1', () => {
    expect(() =>
      buildPlayerProjections(
        bootstrap([element(1)]),
        FIXTURES,
        () => 'a',
        withShare(1.2),
      ),
    ).toThrow('from 0 to 1');
  });

  it('gives the labels a scoring chance, and a clean sheet chance for defenders only', () => {
    const projections = buildPlayerProjections(
      bootstrap([element(1), element(2, { element_type: 3 })]),
      FIXTURES,
      () => 'a',
      OPTIONS,
    );
    const defender = projections.get(1);
    const midfielder = projections.get(2);
    const goals = direct('MID').event.fixtures[0];

    expect(midfielder?.goalOrAssistChance).toBeCloseTo(
      1 - Math.exp(-((goals?.goals ?? 0) + (goals?.assists ?? 0))),
      10,
    );
    expect(midfielder?.cleanSheetChance).toBeNull();
    // arsenal at home to spurs: a better than even chance of a clean sheet
    expect(defender?.cleanSheetChance).toBeGreaterThan(0.3);
    expect(defender?.cleanSheetChance).toBeLessThan(1);
  });

  it('has no scoring or clean sheet chance in a blank', () => {
    const blank = buildPlayerProjections(bootstrap([element(1)]), FIXTURES, () => 'a', {
      ...OPTIONS,
      event: 13,
      horizonEvents: 1,
    }).get(1);

    expect(blank?.points).toBe(0);
    expect(blank?.goalOrAssistChance).toBeNull();
    expect(blank?.cleanSheetChance).toBeNull();
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

  it("multiplies fpl's team news into both models: a 25% doubt and an injury", () => {
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
