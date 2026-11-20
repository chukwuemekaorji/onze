/**
 * pure mapping from fpl's per-gameweek live stats to the match records the
 * projection models read. one live call covers every player for a gameweek,
 * which is what keeps this to a handful of calls instead of one per player
 */

import type { EventMatchRecord } from './analysis/event-projection.js';
import { teamMatchesFrom } from './analysis/team-strength.js';
import type { TeamMatch, TeamRowFacts } from './analysis/team-strength.js';
import type {
  FplBootstrapStatic,
  FplEventLive,
  FplFixture,
  FplLiveElement,
} from './fpl-types.js';

export interface GameweekLive {
  event: number;
  live: FplEventLive;
}

export interface MatchHistory {
  /** every player's club matches this season, oldest first, by element id */
  players: Map<number, EventMatchRecord[]>;
  /** one entry per team per finished match, for team strength */
  teamMatches: TeamMatch[];
}

/**
 * a player only appears in the gameweeks he was registered for, as fpl lists
 * only those, so a mid-season signing doesn't look benched before he arrived
 */
export function buildMatchHistory(
  gameweeks: readonly GameweekLive[],
  fixtures: readonly FplFixture[],
  bootstrap: Pick<FplBootstrapStatic, 'elements' | 'teams'>,
): MatchHistory {
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const teamOf = new Map(
    bootstrap.elements.map((element) => [element.id, element.team]),
  );
  const teamName = new Map(bootstrap.teams.map((team) => [team.id, team.name]));
  const players = new Map<number, EventMatchRecord[]>();
  const teamRows: TeamRowFacts[] = [];
  for (const { event, live } of gameweeks) {
    for (const element of live.elements) {
      const matches = matchesFor(element, event, fixtureById);
      if (matches.length === 0) continue;
      const existing = players.get(element.id);
      const records = matches.map(({ record }) => record);
      if (existing === undefined) players.set(element.id, records);
      else existing.push(...records);
      for (const { record, fixture } of matches) {
        const row = teamRowFor(teamOf.get(element.id), fixture, teamName, record);
        if (row !== null) teamRows.push(row);
      }
    }
  }
  for (const records of players.values()) {
    records.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));
  }
  return { players, teamMatches: teamMatchesFrom(teamRows) };
}

/**
 * fpl only gives a player's current club, so a match from before a move
 * between premier league clubs can't be credited to a side and is left out
 * of team strength; the player's own record keeps it
 */
function teamRowFor(
  teamId: number | undefined,
  fixture: FplFixture,
  teamName: ReadonlyMap<number, string>,
  record: EventMatchRecord,
): TeamRowFacts | null {
  if (teamId !== fixture.team_h && teamId !== fixture.team_a) return null;
  const wasHome = teamId === fixture.team_h;
  const own = teamName.get(teamId);
  const opponent = teamName.get(wasHome ? fixture.team_a : fixture.team_h);
  if (own === undefined || opponent === undefined) return null;
  return {
    fixtureId: fixture.id,
    teamName: own,
    opponentTeamName: opponent,
    wasHome,
    expectedGoals: record.expectedGoals,
  };
}

function matchesFor(
  element: FplLiveElement,
  event: number,
  fixtureById: ReadonlyMap<number, FplFixture>,
): { record: EventMatchRecord; fixture: FplFixture }[] {
  // a match still being played would look like a missed one; full time is
  // enough, as bonus (the only late change) doesn't touch what the models read
  const played = element.explain.flatMap((entry) => {
    const fixture = fixtureById.get(entry.fixture);
    return fixture?.finished_provisional === true && fixture.kickoff_time !== null
      ? [{ entry, fixture, kickoffTime: fixture.kickoff_time }]
      : [];
  });
  const { stats } = element;
  if (played.length === 1 && element.explain.length === 1) {
    const [only] = played;
    if (only === undefined) return [];
    return [
      {
        fixture: only.fixture,
        record: {
          gameweek: event,
          kickoffTime: only.kickoffTime,
          minutes: stats.minutes,
          starts: stats.starts,
          totalPoints: stats.total_points,
          expectedGoals: parseStat(stats.expected_goals),
          expectedAssists: parseStat(stats.expected_assists),
          defensiveContribution: stats.defensive_contribution,
          goalsScored: stats.goals_scored,
          saves: stats.saves,
        },
      },
    ];
  }
  // a double gameweek: fpl splits minutes, points, goals and saves by fixture
  // but sums the rest, so those are shared out by minutes played
  const totalMinutes = played.reduce(
    (sum, { entry }) => sum + statValue(entry, 'minutes'),
    0,
  );
  return played.map(({ entry, fixture, kickoffTime }) => {
    const minutes = statValue(entry, 'minutes');
    const share = totalMinutes === 0 ? 0 : minutes / totalMinutes;
    return {
      fixture,
      record: {
        gameweek: event,
        kickoffTime,
        minutes,
        // starts can't be split; 60 minutes is fpl's own line for a full game
        starts: minutes >= DOUBLE_GAMEWEEK_START_MINUTES ? 1 : 0,
        totalPoints: entry.stats.reduce((sum, stat) => sum + stat.points, 0),
        expectedGoals: parseStat(stats.expected_goals) * share,
        expectedAssists: parseStat(stats.expected_assists) * share,
        defensiveContribution: Math.round(stats.defensive_contribution * share),
        goalsScored: statValue(entry, 'goals_scored'),
        saves: statValue(entry, 'saves'),
      },
    };
  });
}

const DOUBLE_GAMEWEEK_START_MINUTES = 60;

function statValue(
  entry: FplLiveElement['explain'][number],
  identifier: string,
): number {
  return entry.stats.find((stat) => stat.identifier === identifier)?.value ?? 0;
}

// fpl sends expected stats as strings; junk becomes 0 rather than failing the report
function parseStat(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
