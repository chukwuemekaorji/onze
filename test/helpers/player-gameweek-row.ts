import type { PlayerGameweekRow } from '../../lib/dataset/player-gameweek.js';

const GAMEWEEK_ONE_KICKOFF = Date.parse('2024-08-17T14:00:00Z');
const CODE_OFFSET = 10_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** a synthetic row: one fixture per gameweek, a week apart, unless overridden */
export function makeRow(overrides: Partial<PlayerGameweekRow> = {}): PlayerGameweekRow {
  const gameweek = overrides.gameweek ?? 1;
  return {
    season: '2024-25',
    gameweek,
    fixtureId: gameweek * 100,
    playerId: 1,
    // a code that differs from the id, so a test that mixes them up fails
    playerCode: (overrides.playerId ?? 1) + CODE_OFFSET,
    playerName: 'Test Player',
    position: 'MID',
    teamId: 1,
    teamName: 'Arsenal',
    opponentTeamId: 2,
    opponentTeamName: 'Aston Villa',
    wasHome: true,
    kickoffTime: new Date(
      GAMEWEEK_ONE_KICKOFF + (gameweek - 1) * WEEK_MS,
    ).toISOString(),
    fixtureDifficulty: 3,
    totalPoints: 2,
    minutes: 90,
    starts: 1,
    goalsScored: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 1,
    saves: 0,
    bonus: 0,
    bps: 10,
    expectedGoals: 0.1,
    expectedAssists: 0.1,
    expectedGoalsConceded: 1,
    // the default season (2024-25) didn't score defensive contributions
    defensiveContribution: null,
    nowCost: 55,
    leaky: { fplExpectedPoints: 2.5 },
    source: 'vaastav',
    ...overrides,
  };
}
