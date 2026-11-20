import { describe, expect, it } from 'vitest';
import { buildMatchHistory } from '../lib/build-match-history.js';
import type { FplFixture, FplLiveElement } from '../lib/fpl-types.js';

function fixture(
  id: number,
  kickoff: string,
  overrides: Partial<FplFixture> = {},
): FplFixture {
  return {
    id,
    event: 1,
    team_h: 1,
    team_a: 2,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    finished: true,
    finished_provisional: true,
    kickoff_time: kickoff,
    ...overrides,
  };
}

interface ExplainEntry {
  fixture: number;
  minutes: number;
  points: number;
  goals?: number;
  saves?: number;
}

function element(
  id: number,
  explain: ExplainEntry[],
  stats: Partial<FplLiveElement['stats']> = {},
): FplLiveElement {
  const sum = (read: (entry: ExplainEntry) => number) =>
    explain.reduce((total, entry) => total + read(entry), 0);
  return {
    id,
    stats: {
      minutes: sum((entry) => entry.minutes),
      starts: 1,
      total_points: sum((entry) => entry.points),
      expected_goals: '0.60',
      expected_assists: '0.30',
      defensive_contribution: 12,
      goals_scored: sum((entry) => entry.goals ?? 0),
      saves: sum((entry) => entry.saves ?? 0),
      ...stats,
    },
    explain: explain.map((entry) => ({
      fixture: entry.fixture,
      stats: [
        { identifier: 'minutes', points: entry.points, value: entry.minutes },
        ...(entry.goals === undefined
          ? []
          : [{ identifier: 'goals_scored', points: 0, value: entry.goals }]),
        ...(entry.saves === undefined
          ? []
          : [{ identifier: 'saves', points: 0, value: entry.saves }]),
      ],
    })),
  };
}

// players 7 and 8 play for team 1 (Arsenal), 9 for team 2 (Spurs)
const BOOTSTRAP = {
  elements: [
    { id: 7, team: 1 },
    { id: 8, team: 1 },
    { id: 9, team: 2 },
  ],
  teams: [
    { id: 1, name: 'Arsenal' },
    { id: 2, name: 'Spurs' },
  ],
} as Parameters<typeof buildMatchHistory>[2];

describe('buildMatchHistory', () => {
  it("turns each gameweek's live stats into one record per match, oldest first", () => {
    const fixtures = [
      fixture(1, '2026-08-15T14:00:00Z'),
      fixture(2, '2026-08-22T14:00:00Z'),
    ];
    const { players } = buildMatchHistory(
      [
        {
          event: 2,
          live: {
            elements: [
              element(7, [{ fixture: 2, minutes: 0, points: 0 }], { starts: 0 }),
            ],
          },
        },
        {
          event: 1,
          live: {
            elements: [element(7, [{ fixture: 1, minutes: 90, points: 6, goals: 1 }])],
          },
        },
      ],
      fixtures,
      BOOTSTRAP,
    );

    expect(players.get(7)).toEqual([
      {
        gameweek: 1,
        kickoffTime: '2026-08-15T14:00:00Z',
        minutes: 90,
        starts: 1,
        totalPoints: 6,
        expectedGoals: 0.6,
        expectedAssists: 0.3,
        defensiveContribution: 12,
        goalsScored: 1,
        saves: 0,
      },
      expect.objectContaining({ gameweek: 2, minutes: 0, starts: 0 }),
    ]);
  });

  it('splits a double gameweek by fixture: goals and saves exactly, the rest by minutes', () => {
    const fixtures = [
      fixture(1, '2026-08-15T14:00:00Z'),
      fixture(2, '2026-08-18T19:00:00Z'),
    ];
    const { players } = buildMatchHistory(
      [
        {
          event: 1,
          live: {
            elements: [
              element(7, [
                { fixture: 1, minutes: 90, points: 8, goals: 1, saves: 0 },
                { fixture: 2, minutes: 30, points: 1, goals: 0, saves: 2 },
              ]),
            ],
          },
        },
      ],
      fixtures,
      BOOTSTRAP,
    );
    const [first, second] = players.get(7) ?? [];

    expect(first).toMatchObject({
      minutes: 90,
      totalPoints: 8,
      starts: 1,
      defensiveContribution: 9,
      goalsScored: 1,
      saves: 0,
    });
    expect(first?.expectedGoals).toBeCloseTo(0.45);
    expect(second).toMatchObject({
      minutes: 30,
      totalPoints: 1,
      starts: 0,
      defensiveContribution: 3,
      goalsScored: 0,
      saves: 2,
    });
  });

  it("sums each side's xg into its matches, for team strength", () => {
    const { teamMatches } = buildMatchHistory(
      [
        {
          event: 1,
          live: {
            elements: [
              element(7, [{ fixture: 1, minutes: 90, points: 2 }], {
                expected_goals: '0.50',
              }),
              element(8, [{ fixture: 1, minutes: 90, points: 2 }], {
                expected_goals: '0.70',
              }),
              element(9, [{ fixture: 1, minutes: 90, points: 2 }], {
                expected_goals: '0.40',
              }),
            ],
          },
        },
      ],
      [fixture(1, '2026-08-15T14:00:00Z')],
      BOOTSTRAP,
    );

    expect(teamMatches).toHaveLength(2);
    const arsenal = teamMatches.find((match) => match.teamName === 'Arsenal');
    expect(arsenal).toMatchObject({ wasHome: true, expectedGoalsAgainst: 0.4 });
    expect(arsenal?.expectedGoalsFor).toBeCloseTo(1.2);
  });

  it("leaves a match out of team strength when it wasn't the player's current club's", () => {
    // player 9 is at spurs now, but this match was arsenal against team 3
    const { players, teamMatches } = buildMatchHistory(
      [
        {
          event: 1,
          live: { elements: [element(9, [{ fixture: 1, minutes: 90, points: 2 }])] },
        },
      ],
      [fixture(1, '2026-08-15T14:00:00Z', { team_a: 3 })],
      BOOTSTRAP,
    );

    expect(players.get(9)).toHaveLength(1);
    expect(teamMatches).toEqual([]);
  });

  it('leaves out a match still being played, and a gameweek the player missed entirely', () => {
    const fixtures = [
      fixture(1, '2026-08-15T14:00:00Z', {
        finished: false,
        finished_provisional: false,
      }),
    ];
    const { players, teamMatches } = buildMatchHistory(
      [
        {
          event: 1,
          live: {
            elements: [
              element(7, [{ fixture: 1, minutes: 45, points: 1 }]),
              element(8, []),
            ],
          },
        },
      ],
      fixtures,
      BOOTSTRAP,
    );
    expect(players.size).toBe(0);
    expect(teamMatches).toEqual([]);
  });
});
