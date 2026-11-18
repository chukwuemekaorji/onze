import type { LeagueStanding } from './types.js';

/** a finish worth a mention: leading the league or close behind */
export const NOTABLE_RANK_CUTOFF = 3;

/**
 * a standing that says something about the manager's season. leading needs at
 * least one rival; a top-three spot doesn't count when it's also last place,
 * as in a three-team league. fpl reports 0 before a league has been ranked
 */
export function isNotableStanding(standing: LeagueStanding): boolean {
  const { rank, totalEntries } = standing;
  if (!Number.isInteger(rank) || rank < 1 || totalEntries < 2) return false;
  if (rank === 1) return true;
  return rank <= NOTABLE_RANK_CUTOFF && rank < totalEntries;
}

/**
 * the one league the report may name, or null to keep leagues out of it.
 * best rank wins; on a tie, the bigger league, since topping more people means more
 */
export function notableLeague(standings: LeagueStanding[]): LeagueStanding | null {
  const notable = standings.filter(isNotableStanding);
  notable.sort((a, b) => a.rank - b.rank || b.totalEntries - a.totalEntries);
  return notable[0] ?? null;
}
