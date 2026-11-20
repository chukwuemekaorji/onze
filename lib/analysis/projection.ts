import {
  ASSIST_POINTS,
  DEFENSIVE_CONTRIBUTION_POINTS,
  DEFENSIVE_CONTRIBUTION_THRESHOLD,
  FULL_APPEARANCE_MINUTES,
  GOAL_POINTS,
  defensiveContributionPoints,
  scoresDefensiveContributions,
} from './fpl-scoring.js';
import { poissonAtLeast } from './poisson.js';
import type { Position } from './types.js';

/**
 * expected fpl points for one player in one gameweek:
 *   chance of playing x expected points if playing, summed over the fixtures.
 * a double gameweek sums two fixtures, a blank has none and projects 0.
 * the weights are fitted offline (npm run eval:projection) and are small in
 * number on purpose, so each one can be read and explained.
 *
 * they were fitted on seasons without defensive contribution points, so those
 * points are taken out of every match's total before the model reads it, and
 * added back as a rule-based term for the seasons that score them
 */

/** one club match while the player was registered, played or not */
export interface MatchRecord {
  gameweek: number;
  kickoffTime: string;
  minutes: number;
  /** null in data that doesn't record starts */
  starts: number | null;
  totalPoints: number;
  expectedGoals: number | null;
  expectedAssists: number | null;
  /** null in seasons that didn't score defensive contributions */
  defensiveContribution: number | null;
}

/** a whole season boiled down to the totals the model reads from it */
export interface SeasonSummary {
  /** club matches while registered, played or not */
  matches: number;
  appearances: number;
  starts: number;
  /** over appearances, defensive contribution points taken out */
  points: number;
  minutes: number;
  /** each expected stat with the minutes of the matches that recorded it */
  expectedGoals: number;
  expectedGoalsMinutes: number;
  expectedAssists: number;
  expectedAssistsMinutes: number;
  defensiveContribution: number;
  defensiveContributionMinutes: number;
}

export interface FixtureContext {
  /** fpl's 1 to 5 rating from this player's side */
  fixtureDifficulty: number;
  wasHome: boolean;
}

/** league-wide averages from last season, the prior for anyone without their own */
export interface LeaguePrior {
  pointsPerAppearance: Record<Position, number>;
  minutesPerAppearance: Record<Position, number>;
  expectedGoalsPer90: Record<Position, number>;
  expectedAssistsPer90: Record<Position, number>;
  /** 0 when last season didn't score defensive contributions */
  defensiveContributionPer90: Record<Position, number>;
  /** share of registered players' club matches with any minutes */
  appearanceShare: number;
  startShare: number;
}

export interface ProjectionInput {
  /** the season being projected, e.g. "2026-27": it decides the scoring rules */
  season: string;
  position: Position;
  /** fpl cost units: 55 means £5.5m */
  nowCost: number;
  /** the gameweek's deadline, or its first kickoff */
  deadline: string;
  fixtures: readonly FixtureContext[];
  /** this season's club matches before the deadline, oldest first */
  thisSeason: readonly MatchRecord[];
  /** the same person last season (joined on fpl's stable code); all 0 if new to the league */
  lastSeason: SeasonSummary;
  league: LeaguePrior;
}

export const PLAY_FEATURES = [
  'intercept',
  'recentStartShare',
  'recentAppearanceShare',
  'seasonAppearanceShare',
  'priceMillions',
] as const;
export type PlayFeature = (typeof PLAY_FEATURES)[number];

export const POINTS_FEATURES = [
  'goalkeeper',
  'defender',
  'midfielder',
  'forward',
  'seasonPointsPerAppearance',
  'formPointsPerAppearance',
  'lastThreePointsPerAppearance',
  'attackingPointsPerAppearance',
  'priceMillions',
  'defensiveFixtureDifficulty',
  'attackingFixtureDifficulty',
  'home',
] as const;
export type PointsFeature = (typeof POINTS_FEATURES)[number];

export type PlayFeatures = Record<PlayFeature, number>;
export type PointsFeatures = Record<PointsFeature, number>;

export interface ProjectionWeights {
  /** logistic: log-odds of any minutes in a fixture */
  chanceOfPlaying: PlayFeatures;
  /** linear: points in a fixture, given the player gets on */
  pointsIfPlaying: PointsFeatures;
}

export interface Projection {
  chanceOfPlaying: number;
  /** one per fixture, in the order given, defensive contributions included */
  pointsIfPlaying: number[];
  /** the rule-based part of each fixture's points if playing; 0 before 2025-26 */
  defensiveContributionIfPlaying: number;
  expectedPoints: number;
}

// how many matches of prior evidence a player's own numbers are blended with.
// a player with 4 appearances is half their own average, half the prior
export const PRIOR_APPEARANCES = 4;
export const PRIOR_NINETIES = 4;
// recent windows: the last 3 club matches for playing time, 30 days for form
// (fpl's own definition), the last 6 appearances for expected goals and assists
export const RECENT_MATCHES = 3;
export const FORM_WINDOW_DAYS = 30;
export const RECENT_APPEARANCES_FOR_XGI = 6;
const RECENT_PRIOR_WEIGHT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const COST_UNITS_PER_MILLION = 10;
const NEUTRAL_DIFFICULTY = 3;

/** the full projection for one player and gameweek */
export function projectPlayer(
  input: ProjectionInput,
  weights: ProjectionWeights,
): Projection {
  const chanceOfPlaying = logistic(dot(weights.chanceOfPlaying, playFeatures(input)));
  const defensiveContributionIfPlaying = scoresDefensiveContributions(input.season)
    ? expectedDefensiveContributionPoints(input)
    : 0;
  const pointsIfPlaying = pointsFeatures(input).map(
    (features) =>
      // a player who gets on scores at least 0; the fit is linear, so keep it there
      Math.max(0, dot(weights.pointsIfPlaying, features)) +
      defensiveContributionIfPlaying,
  );
  const expectedPoints = pointsIfPlaying.reduce(
    (sum, points) => sum + chanceOfPlaying * points,
    0,
  );
  return {
    chanceOfPlaying,
    pointsIfPlaying,
    defensiveContributionIfPlaying,
    expectedPoints,
  };
}

/**
 * 2 points times the chance of reaching the position's count. the count is
 * poisson at the player's recent per 90 rate, averaged over the minutes of his
 * recent appearances: a full game and a cameo have very different chances, and
 * one average of their minutes would blur both
 */
export function expectedDefensiveContributionPoints(input: ProjectionInput): number {
  const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[input.position];
  if (threshold === null) return 0;
  const { lastSeason, league, position } = input;
  const recentApps = input.thisSeason
    .filter(appeared)
    .slice(-RECENT_APPEARANCES_FOR_XGI);
  const per90 = ratePer90(
    recentApps,
    (match) => match.defensiveContribution,
    priorRatePer90(
      lastSeason.defensiveContribution,
      lastSeason.defensiveContributionMinutes,
      league.defensiveContributionPer90[position],
    ),
  );
  const minutes =
    recentApps.length > 0
      ? recentApps.map((match) => match.minutes)
      : [minutesPerAppearance(input)];
  const chance =
    minutes.reduce(
      (sum, played) => sum + poissonAtLeast((per90 * played) / 90, threshold),
      0,
    ) / minutes.length;
  return chance * DEFENSIVE_CONTRIBUTION_POINTS;
}

/** what decides whether the player gets on at all */
export function playFeatures(input: ProjectionInput): PlayFeatures {
  const priorAppearance = shrink(
    input.lastSeason.appearances,
    input.lastSeason.matches,
    input.league.appearanceShare,
    PRIOR_APPEARANCES,
  );
  const priorStart = shrink(
    input.lastSeason.starts,
    input.lastSeason.matches,
    input.league.startShare,
    PRIOR_APPEARANCES,
  );
  const recent = input.thisSeason.slice(-RECENT_MATCHES);
  return {
    intercept: 1,
    recentStartShare: shrink(
      countWhere(recent, started),
      recent.length,
      priorStart,
      RECENT_PRIOR_WEIGHT,
    ),
    recentAppearanceShare: shrink(
      countWhere(recent, appeared),
      recent.length,
      priorAppearance,
      RECENT_PRIOR_WEIGHT,
    ),
    seasonAppearanceShare: shrink(
      countWhere(input.thisSeason, appeared),
      input.thisSeason.length,
      priorAppearance,
      PRIOR_APPEARANCES,
    ),
    priceMillions: input.nowCost / COST_UNITS_PER_MILLION,
  };
}

/** what the player scores once on the pitch, one entry per fixture */
export function pointsFeatures(input: ProjectionInput): PointsFeatures[] {
  const { position, league, lastSeason } = input;
  const apps = input.thisSeason.filter(appeared);
  const points = (match: MatchRecord) => basePoints(match, position);

  const priorPoints = shrink(
    lastSeason.points,
    lastSeason.appearances,
    league.pointsPerAppearance[position],
    PRIOR_APPEARANCES,
  );
  const season = shrink(
    sumOf(apps, points),
    apps.length,
    priorPoints,
    PRIOR_APPEARANCES,
  );
  const windowStart = Date.parse(input.deadline) - FORM_WINDOW_DAYS * DAY_MS;
  const formApps = apps.filter((match) => Date.parse(match.kickoffTime) >= windowStart);
  const recentGameweeks = new Set(
    [...new Set(input.thisSeason.map((match) => match.gameweek))].slice(
      -RECENT_MATCHES,
    ),
  );
  const lastThreeApps = apps.filter((match) => recentGameweeks.has(match.gameweek));

  const shared = {
    seasonPointsPerAppearance: season,
    formPointsPerAppearance: shrink(
      sumOf(formApps, points),
      formApps.length,
      season,
      RECENT_PRIOR_WEIGHT,
    ),
    lastThreePointsPerAppearance: shrink(
      sumOf(lastThreeApps, points),
      lastThreeApps.length,
      season,
      RECENT_PRIOR_WEIGHT,
    ),
    attackingPointsPerAppearance: attackingPointsPerAppearance(input, apps),
    priceMillions: input.nowCost / COST_UNITS_PER_MILLION,
    goalkeeper: position === 'GK' ? 1 : 0,
    defender: position === 'DEF' ? 1 : 0,
    midfielder: position === 'MID' ? 1 : 0,
    forward: position === 'FWD' ? 1 : 0,
  };
  const defensive = position === 'GK' || position === 'DEF';
  return input.fixtures.map((fixture) => {
    const harder = fixture.fixtureDifficulty - NEUTRAL_DIFFICULTY;
    return {
      ...shared,
      defensiveFixtureDifficulty: defensive ? harder : 0,
      attackingFixtureDifficulty: defensive ? 0 : harder,
      home: fixture.wasHome ? 1 : 0,
    };
  });
}

/**
 * goals and assists the player is expected to create, in fpl points, over the
 * minutes they usually play. per 90 so a sub's numbers aren't flattered or buried
 */
function attackingPointsPerAppearance(
  input: ProjectionInput,
  apps: readonly MatchRecord[],
): number {
  const { position, league, lastSeason } = input;
  const recentApps = apps.slice(-RECENT_APPEARANCES_FOR_XGI);
  const goalsPer90 = ratePer90(
    recentApps,
    (match) => match.expectedGoals,
    priorRatePer90(
      lastSeason.expectedGoals,
      lastSeason.expectedGoalsMinutes,
      league.expectedGoalsPer90[position],
    ),
  );
  const assistsPer90 = ratePer90(
    recentApps,
    (match) => match.expectedAssists,
    priorRatePer90(
      lastSeason.expectedAssists,
      lastSeason.expectedAssistsMinutes,
      league.expectedAssistsPer90[position],
    ),
  );
  return (
    (goalsPer90 * GOAL_POINTS[position] + assistsPer90 * ASSIST_POINTS) *
    (minutesPerAppearance(input) / 90)
  );
}

/** the minutes he usually plays when he gets on, blended with last season and the league */
export function minutesPerAppearance(input: ProjectionInput): number {
  const { position, league, lastSeason } = input;
  const apps = input.thisSeason.filter(appeared);
  const priorMinutes = shrink(
    lastSeason.minutes,
    lastSeason.appearances,
    league.minutesPerAppearance[position],
    PRIOR_APPEARANCES,
  );
  return shrink(
    sumOf(apps, (match) => match.minutes),
    apps.length,
    priorMinutes,
    PRIOR_APPEARANCES,
  );
}

/** last season's per 90, blended with the league's */
export function priorRatePer90(
  total: number,
  minutes: number,
  leaguePer90: number,
): number {
  return shrink(total, minutes / 90, leaguePer90, PRIOR_NINETIES);
}

/** per 90 over some matches, blended with a prior rate */
export function ratePer90<M extends MatchRecord>(
  matches: readonly M[],
  read: (match: M) => number | null,
  prior: number,
): number {
  const { total, minutes } = per90Totals(matches, read);
  return shrink(total, minutes / 90, prior, PRIOR_NINETIES);
}

/** a plain per 90 over a whole league season: enough minutes that no prior is needed */
export function leagueRatePer90<M extends MatchRecord>(
  matches: readonly M[],
  read: (match: M) => number | null,
): number {
  const { total, minutes } = per90Totals(matches, read);
  const nineties = minutes / 90;
  return nineties === 0 ? 0 : total / nineties;
}

/** matches with no expected stats are skipped, minutes and all */
function per90Totals<M extends MatchRecord>(
  matches: readonly M[],
  read: (match: M) => number | null,
): { total: number; minutes: number } {
  let total = 0;
  let minutes = 0;
  for (const match of matches) {
    const value = read(match);
    if (value === null) continue;
    total += value;
    minutes += match.minutes;
  }
  return { total, minutes };
}

/** league averages from last season's rows, the prior for new arrivals */
export function leaguePriorFrom(
  rows: readonly (MatchRecord & { position: Position })[],
): LeaguePrior {
  if (rows.length === 0) throw new Error("a league prior needs last season's rows");
  const byPosition = <T>(
    make: (matches: (MatchRecord & { position: Position })[]) => T,
  ) =>
    ({
      GK: make(rows.filter((row) => row.position === 'GK' && appeared(row))),
      DEF: make(rows.filter((row) => row.position === 'DEF' && appeared(row))),
      MID: make(rows.filter((row) => row.position === 'MID' && appeared(row))),
      FWD: make(rows.filter((row) => row.position === 'FWD' && appeared(row))),
    }) satisfies Record<Position, T>;
  const mean = (
    matches: readonly MatchRecord[],
    read: (match: MatchRecord) => number,
  ) => (matches.length === 0 ? 0 : sumOf(matches, read) / matches.length);
  const per90 = (
    matches: readonly MatchRecord[],
    read: (match: MatchRecord) => number | null,
  ) => leagueRatePer90(matches, read);
  return {
    pointsPerAppearance: {
      GK: meanBasePoints(rows, 'GK'),
      DEF: meanBasePoints(rows, 'DEF'),
      MID: meanBasePoints(rows, 'MID'),
      FWD: meanBasePoints(rows, 'FWD'),
    },
    minutesPerAppearance: byPosition((m) => mean(m, (match) => match.minutes)),
    expectedGoalsPer90: byPosition((m) => per90(m, (match) => match.expectedGoals)),
    expectedAssistsPer90: byPosition((m) => per90(m, (match) => match.expectedAssists)),
    defensiveContributionPer90: byPosition((m) =>
      per90(m, (match) => match.defensiveContribution),
    ),
    appearanceShare: countWhere(rows, appeared) / rows.length,
    startShare: countWhere(rows, started) / rows.length,
  };
}

function meanBasePoints(
  rows: readonly (MatchRecord & { position: Position })[],
  position: Position,
): number {
  const apps = rows.filter((row) => row.position === position && appeared(row));
  return apps.length === 0
    ? 0
    : sumOf(apps, (row) => basePoints(row, position)) / apps.length;
}

/** a match's points without the defensive contribution points the fit never saw */
export function basePoints(match: MatchRecord, position: Position): number {
  return (
    match.totalPoints -
    defensiveContributionPoints(position, match.defensiveContribution)
  );
}

/** last season as the totals the model reads; an empty list gives all 0 */
export function summariseSeason(
  matches: readonly MatchRecord[],
  position: Position,
): SeasonSummary {
  const apps = matches.filter(appeared);
  const xg = per90Totals(apps, (match) => match.expectedGoals);
  const xa = per90Totals(apps, (match) => match.expectedAssists);
  const dc = per90Totals(apps, (match) => match.defensiveContribution);
  return {
    matches: matches.length,
    appearances: apps.length,
    starts: countWhere(matches, started),
    points: sumOf(apps, (match) => basePoints(match, position)),
    minutes: sumOf(apps, (match) => match.minutes),
    expectedGoals: xg.total,
    expectedGoalsMinutes: xg.minutes,
    expectedAssists: xa.total,
    expectedAssistsMinutes: xa.minutes,
    defensiveContribution: dc.total,
    defensiveContributionMinutes: dc.minutes,
  };
}

/** (own total + strength x prior) / (own count + strength): no data gives the prior */
export function shrink(
  total: number,
  count: number,
  prior: number,
  strength: number,
): number {
  return (total + strength * prior) / (count + strength);
}

export function logistic(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

export function dot<K extends string>(
  weights: Readonly<Record<K, number>>,
  features: Readonly<Record<K, number>>,
): number {
  let total = 0;
  for (const key of Object.keys(weights) as K[]) total += weights[key] * features[key];
  return total;
}

export function appeared(match: MatchRecord): boolean {
  return match.minutes > 0;
}

// data without starts: 60 minutes is fpl's own line for a full appearance
function started(match: MatchRecord): boolean {
  return match.starts === null
    ? match.minutes >= FULL_APPEARANCE_MINUTES
    : match.starts > 0;
}

function countWhere<T>(items: readonly T[], test: (item: T) => boolean): number {
  return items.reduce((count, item) => count + (test(item) ? 1 : 0), 0);
}

export function sumOf<T>(items: readonly T[], read: (item: T) => number): number {
  return items.reduce((sum, item) => sum + read(item), 0);
}
