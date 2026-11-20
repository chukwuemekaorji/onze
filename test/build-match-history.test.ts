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

function element(
  id: number,
  explain: { fixture: number; minutes: number; points: number }[],
  stats: Partial<FplLiveElement['stats']> = {},
): FplLiveElement {
  return {
    id,
    stats: {
      minutes: explain.reduce((sum, entry) => sum + entry.minutes, 0),
      starts: 1,
      total_points: explain.reduce((sum, entry) => sum + entry.points, 0),
      expected_goals: '0.60',
      expected_assists: '0.30',
      defensive_contribution: 12,
      ...stats,
    },
    explain: explain.map((entry) => ({
      fixture: entry.fixture,
      stats: [{ identifier: 'minutes', points: entry.points, value: entry.minutes }],
    })),
  };
}

describe('buildMatchHistory', () => {
  it("turns each gameweek's live stats into one record per match, oldest first", () => {
    const fixtures = [
      fixture(1, '2026-08-15T14:00:00Z'),
      fixture(2, '2026-08-22T14:00:00Z'),
    ];
    const history = buildMatchHistory(
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
          live: { elements: [element(7, [{ fixture: 1, minutes: 90, points: 6 }])] },
        },
      ],
      fixtures,
    );

    expect(history.get(7)).toEqual([
      {
        gameweek: 1,
        kickoffTime: '2026-08-15T14:00:00Z',
        minutes: 90,
        starts: 1,
        totalPoints: 6,
        expectedGoals: 0.6,
        expectedAssists: 0.3,
        defensiveContribution: 12,
      },
      expect.objectContaining({ gameweek: 2, minutes: 0, starts: 0 }),
    ]);
  });

  it('splits a double gameweek by fixture, sharing the summed stats by minutes', () => {
    const fixtures = [
      fixture(1, '2026-08-15T14:00:00Z'),
      fixture(2, '2026-08-18T19:00:00Z'),
    ];
    const history = buildMatchHistory(
      [
        {
          event: 1,
          live: {
            elements: [
              element(7, [
                { fixture: 1, minutes: 90, points: 8 },
                { fixture: 2, minutes: 30, points: 1 },
              ]),
            ],
          },
        },
      ],
      fixtures,
    );
    const [first, second] = history.get(7) ?? [];

    expect(first).toMatchObject({
      minutes: 90,
      totalPoints: 8,
      starts: 1,
      defensiveContribution: 9,
    });
    expect(first?.expectedGoals).toBeCloseTo(0.45);
    expect(second).toMatchObject({
      minutes: 30,
      totalPoints: 1,
      starts: 0,
      defensiveContribution: 3,
    });
  });

  it('leaves out a match still being played, and a gameweek the player missed entirely', () => {
    const fixtures = [
      fixture(1, '2026-08-15T14:00:00Z', {
        finished: false,
        finished_provisional: false,
      }),
    ];
    const history = buildMatchHistory(
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
    );
    expect(history.size).toBe(0);
  });
});
