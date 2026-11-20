/**
 * pure mapping from fpl's per-gameweek live stats to the match records the
 * projection model reads. one live call covers every player for a gameweek,
 * which is what keeps this to a handful of calls instead of one per player
 */

import type { MatchRecord } from './analysis/projection.js';
import type { FplEventLive, FplFixture, FplLiveElement } from './fpl-types.js';

export interface GameweekLive {
  event: number;
  live: FplEventLive;
}

/**
 * every player's club matches this season, oldest first, keyed by element id.
 * a player only appears in the gameweeks he was registered for, as fpl lists
 * only those, so a mid-season signing doesn't look benched before he arrived
 */
export function buildMatchHistory(
  gameweeks: readonly GameweekLive[],
  fixtures: readonly FplFixture[],
): Map<number, MatchRecord[]> {
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const history = new Map<number, MatchRecord[]>();
  for (const { event, live } of gameweeks) {
    for (const element of live.elements) {
      const records = recordsFor(element, event, fixtureById);
      if (records.length === 0) continue;
      const existing = history.get(element.id);
      if (existing === undefined) history.set(element.id, records);
      else existing.push(...records);
    }
  }
  for (const records of history.values()) {
    records.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime));
  }
  return history;
}

function recordsFor(
  element: FplLiveElement,
  event: number,
  fixtureById: ReadonlyMap<number, FplFixture>,
): MatchRecord[] {
  // a match still being played would look like a missed one; full time is
  // enough, as bonus (the only late change) doesn't touch what the model reads
  const played = element.explain.flatMap((entry) => {
    const fixture = fixtureById.get(entry.fixture);
    return fixture?.finished_provisional === true && fixture.kickoff_time !== null
      ? [{ entry, kickoffTime: fixture.kickoff_time }]
      : [];
  });
  const { stats } = element;
  if (played.length === 1 && element.explain.length === 1) {
    const [only] = played;
    if (only === undefined) return [];
    return [
      {
        gameweek: event,
        kickoffTime: only.kickoffTime,
        minutes: stats.minutes,
        starts: stats.starts,
        totalPoints: stats.total_points,
        expectedGoals: parseStat(stats.expected_goals),
        expectedAssists: parseStat(stats.expected_assists),
        defensiveContribution: stats.defensive_contribution,
      },
    ];
  }
  // a double gameweek: fpl splits minutes and points by fixture but sums the
  // rest, so those are shared out by minutes played
  const totalMinutes = played.reduce(
    (sum, { entry }) => sum + statValue(entry, 'minutes'),
    0,
  );
  return played.map(({ entry, kickoffTime }) => {
    const minutes = statValue(entry, 'minutes');
    const share = totalMinutes === 0 ? 0 : minutes / totalMinutes;
    return {
      gameweek: event,
      kickoffTime,
      minutes,
      // starts can't be split; 60 minutes is fpl's own line for a full game
      starts: minutes >= DOUBLE_GAMEWEEK_START_MINUTES ? 1 : 0,
      totalPoints: entry.stats.reduce((sum, stat) => sum + stat.points, 0),
      expectedGoals: parseStat(stats.expected_goals) * share,
      expectedAssists: parseStat(stats.expected_assists) * share,
      defensiveContribution: Math.round(stats.defensive_contribution * share),
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
