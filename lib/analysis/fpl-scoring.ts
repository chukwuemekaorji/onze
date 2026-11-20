import type { Position } from './types.js';

/**
 * fpl's scoring rules. eventPoints is the rules of the seasons the models were
 * fitted on, 2022-23 to 2024-25. 2025-26 added defensive contribution points;
 * those are the separate rule below, which both projection models add on top
 * for the seasons that score them
 */

export const GOAL_POINTS: Record<Position, number> = { GK: 6, DEF: 6, MID: 5, FWD: 4 };
export const ASSIST_POINTS = 3;
export const CLEAN_SHEET_POINTS: Record<Position, number> = {
  GK: 4,
  DEF: 4,
  MID: 1,
  FWD: 0,
};
// 1 point for getting on, 2 for 60 minutes or more
export const FULL_APPEARANCE_MINUTES = 60;
export const SUB_APPEARANCE_POINTS = 1;
export const FULL_APPEARANCE_POINTS = 2;
// a keeper or defender loses 1 point per 2 goals conceded while on the pitch
export const GOALS_CONCEDED_PER_PENALTY = 2;
// a keeper earns 1 point per 3 saves
export const SAVES_PER_POINT = 3;

export function concedesPoints(position: Position): boolean {
  return position === 'GK' || position === 'DEF';
}

/** what one player did in one match, as fpl records it */
export interface MatchEvents {
  minutes: number;
  goalsScored: number;
  assists: number;
  /** fpl only credits a clean sheet after 60 minutes */
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  bonus: number;
}

const EVENT_COUNTS = [
  'minutes',
  'goalsScored',
  'assists',
  'cleanSheets',
  'goalsConceded',
  'saves',
  'bonus',
] as const satisfies readonly (keyof MatchEvents)[];

/** points from each recorded event, by fpl's rules */
export interface EventPoints {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  goalsConceded: number;
  saves: number;
  bonus: number;
}

export function eventPoints(position: Position, events: MatchEvents): EventPoints {
  // a whole row is often passed in; only the event counts are checked
  for (const name of EVENT_COUNTS) {
    const value = events[name];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a whole number from 0, got ${value}`);
    }
  }
  if (events.minutes === 0) {
    return {
      appearance: 0,
      goals: 0,
      assists: 0,
      cleanSheet: 0,
      goalsConceded: 0,
      saves: 0,
      bonus: 0,
    };
  }
  return {
    appearance:
      events.minutes >= FULL_APPEARANCE_MINUTES
        ? FULL_APPEARANCE_POINTS
        : SUB_APPEARANCE_POINTS,
    goals: events.goalsScored * GOAL_POINTS[position],
    assists: events.assists * ASSIST_POINTS,
    cleanSheet: events.cleanSheets * CLEAN_SHEET_POINTS[position],
    goalsConceded: concedesPoints(position)
      ? -Math.floor(events.goalsConceded / GOALS_CONCEDED_PER_PENALTY)
      : 0,
    saves: position === 'GK' ? Math.floor(events.saves / SAVES_PER_POINT) : 0,
    bonus: events.bonus,
  };
}

/**
 * the total of eventPoints. what's left of totalPoints after this and any
 * defensive contribution points is cards, own goals and penalties saved or
 * missed, which the data doesn't split out
 */
export function pointsFromEvents(position: Position, events: MatchEvents): number {
  return Object.values(eventPoints(position, events)).reduce(
    (sum, value) => sum + value,
    0,
  );
}

// defensive contributions, from 2025-26: 2 points for reaching a count in one
// match. defenders count clearances, blocks, interceptions and tackles;
// midfielders and forwards count recoveries too. fpl's defensive_contribution
// stat is already the right count for the player's position. keepers can't earn them
export const FIRST_DEFENSIVE_CONTRIBUTION_SEASON = '2025-26';
export const DEFENSIVE_CONTRIBUTION_POINTS = 2;
export const DEFENSIVE_CONTRIBUTION_THRESHOLD: Record<Position, number | null> = {
  GK: null,
  DEF: 10,
  MID: 12,
  FWD: 12,
};

/** season labels like "2025-26" sort in time order as plain strings */
export function scoresDefensiveContributions(season: string): boolean {
  return season >= FIRST_DEFENSIVE_CONTRIBUTION_SEASON;
}

/** points one match's count earned; null means the season didn't score them */
export function defensiveContributionPoints(
  position: Position,
  count: number | null,
): number {
  const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[position];
  if (count === null || threshold === null) return 0;
  return count >= threshold ? DEFENSIVE_CONTRIBUTION_POINTS : 0;
}

/** cards, own goals and penalties: what a match's total has beyond the scored events */
export function otherPoints(
  position: Position,
  match: MatchEvents & { totalPoints: number; defensiveContribution: number | null },
): number {
  return (
    match.totalPoints -
    pointsFromEvents(position, match) -
    defensiveContributionPoints(position, match.defensiveContribution)
  );
}
