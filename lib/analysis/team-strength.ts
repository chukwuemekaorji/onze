import { shrink, sumOf } from './projection.js';

/**
 * how well each team attacks and defends, from expected goals per match. xg is
 * steadier than goals over a few matches, which is what early season needs.
 * teams are keyed by name: fpl renumbers team ids every season
 */

/** the facts team strength needs from one player row */
export interface TeamRowFacts {
  fixtureId: number;
  teamName: string;
  opponentTeamName: string;
  wasHome: boolean;
  expectedGoals: number | null;
}

/** one team in one match */
export interface TeamMatch {
  teamName: string;
  wasHome: boolean;
  expectedGoalsFor: number;
  expectedGoalsAgainst: number;
}

export interface TeamStrength {
  /** expected goals for per match */
  attack: number;
  /** expected goals against per match */
  defence: number;
}

export interface TeamStrengths {
  /** average expected goals per team per match last season */
  goalsPerTeamMatch: number;
  /** home and away scoring as a share of that average */
  homeFactor: number;
  awayFactor: number;
  teams: ReadonlyMap<string, TeamStrength>;
  /** for a team with no matches here at all: a promoted side */
  newcomer: TeamStrength;
}

/** what a fixture means for scoring and conceding, relative to an average match */
export interface FixtureGoalRates {
  /** how much easier than usual it is for the team to score: player attacking rates scale by it */
  scoringMultiplier: number;
  /** how much harder than usual the opponent attacks: keeper saves scale by it */
  opponentAttackMultiplier: number;
  /** expected goals the team concedes over 90 minutes */
  expectedGoalsAgainst: number;
}

// a team's own matches are blended with this many matches of last season
export const TEAM_PRIOR_MATCHES = 6;
// promoted sides usually look like the sides they replace
export const NEWCOMER_PRIOR_TEAMS = 3;

/** one entry per team per fixture, from player rows */
export function teamMatchesFrom(rows: readonly TeamRowFacts[]): TeamMatch[] {
  const sums = new Map<string, { row: TeamRowFacts; expectedGoals: number }>();
  for (const row of rows) {
    // a source without xg can't rate teams; those rows are left out, not read as 0
    if (row.expectedGoals === null) continue;
    const key = `${row.fixtureId}/${row.teamName}`;
    const entry = sums.get(key);
    if (entry === undefined) sums.set(key, { row, expectedGoals: row.expectedGoals });
    else entry.expectedGoals += row.expectedGoals;
  }
  const matches: TeamMatch[] = [];
  for (const { row, expectedGoals } of sums.values()) {
    const opponent = sums.get(`${row.fixtureId}/${row.opponentTeamName}`);
    if (opponent === undefined) continue;
    matches.push({
      teamName: row.teamName,
      wasHome: row.wasHome,
      expectedGoalsFor: expectedGoals,
      expectedGoalsAgainst: opponent.expectedGoals,
    });
  }
  return matches;
}

/** this season's matches, each team blended with its own last season */
export function teamStrengths(
  thisSeason: readonly TeamMatch[],
  lastSeason: readonly TeamMatch[],
): TeamStrengths {
  if (lastSeason.length === 0)
    throw new Error("team strengths need last season's matches");
  const goalsPerTeamMatch = meanOf(lastSeason, (match) => match.expectedGoalsFor);
  const home = lastSeason.filter((match) => match.wasHome);
  const away = lastSeason.filter((match) => !match.wasHome);
  const lastByTeam = averageByTeam(lastSeason);
  const newcomer = newcomerPrior([...lastByTeam.values()]);

  const teams = new Map<string, TeamStrength>();
  const names = new Set([
    ...thisSeason.map((match) => match.teamName),
    ...lastByTeam.keys(),
  ]);
  for (const name of names) {
    const own = thisSeason.filter((match) => match.teamName === name);
    const prior = lastByTeam.get(name) ?? newcomer;
    teams.set(name, {
      attack: shrink(
        sumOf(own, (match) => match.expectedGoalsFor),
        own.length,
        prior.attack,
        TEAM_PRIOR_MATCHES,
      ),
      defence: shrink(
        sumOf(own, (match) => match.expectedGoalsAgainst),
        own.length,
        prior.defence,
        TEAM_PRIOR_MATCHES,
      ),
    });
  }
  return {
    goalsPerTeamMatch,
    homeFactor: meanOf(home, (match) => match.expectedGoalsFor) / goalsPerTeamMatch,
    awayFactor: meanOf(away, (match) => match.expectedGoalsFor) / goalsPerTeamMatch,
    teams,
    newcomer,
  };
}

/**
 * multiplicative strengths: expected goals = league average x attack x the
 * opponent's defence x home or away, each as a share of the average
 */
export function fixtureGoalRates(
  strengths: TeamStrengths,
  teamName: string,
  opponentTeamName: string,
  wasHome: boolean,
): FixtureGoalRates {
  const average = strengths.goalsPerTeamMatch;
  const team = strengths.teams.get(teamName) ?? strengths.newcomer;
  const opponent = strengths.teams.get(opponentTeamName) ?? strengths.newcomer;
  const teamSide = wasHome ? strengths.homeFactor : strengths.awayFactor;
  const opponentSide = wasHome ? strengths.awayFactor : strengths.homeFactor;
  const opponentAttackMultiplier = (opponent.attack / average) * opponentSide;
  return {
    scoringMultiplier: (opponent.defence / average) * teamSide,
    opponentAttackMultiplier,
    expectedGoalsAgainst: opponentAttackMultiplier * team.defence,
  };
}

function averageByTeam(matches: readonly TeamMatch[]): Map<string, TeamStrength> {
  const byTeam = new Map<string, TeamMatch[]>();
  for (const match of matches) {
    const group = byTeam.get(match.teamName);
    if (group === undefined) byTeam.set(match.teamName, [match]);
    else group.push(match);
  }
  return new Map(
    [...byTeam].map(([name, group]) => [
      name,
      {
        attack: meanOf(group, (match) => match.expectedGoalsFor),
        defence: meanOf(group, (match) => match.expectedGoalsAgainst),
      },
    ]),
  );
}

/** the average of last season's weakest sides by expected goal difference */
function newcomerPrior(teams: readonly TeamStrength[]): TeamStrength {
  const weakest = [...teams]
    .sort((a, b) => a.attack - a.defence - (b.attack - b.defence))
    .slice(0, NEWCOMER_PRIOR_TEAMS);
  return {
    attack: meanOf(weakest, (team) => team.attack),
    defence: meanOf(weakest, (team) => team.defence),
  };
}

function meanOf<T>(items: readonly T[], read: (item: T) => number): number {
  return items.length === 0 ? 0 : sumOf(items, read) / items.length;
}
