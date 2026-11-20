import { ASSIST_POINTS, FULL_APPEARANCE_MINUTES, GOAL_POINTS } from './fpl-scoring.js';
import type { Position } from './types.js';

/**
 * expected fpl points for one player in one gameweek:
 *   chance of playing x expected points if playing, summed over the fixtures.
 * a double gameweek sums two fixtures, a blank has none and projects 0.
 * the weights are fitted offline (npm run eval:projection) and are small in
 * number on purpose, so each one can be read and explained
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
  /** share of registered players' club matches with any minutes */
  appearanceShare: number;
  startShare: number;
}

export interface ProjectionInput {
  position: Position;
  /** fpl cost units: 55 means £5.5m */
  nowCost: number;
  /** the gameweek's deadline, or its first kickoff */
  deadline: string;
  fixtures: readonly FixtureContext[];
  /** this season's club matches before the deadline, oldest first */
  thisSeason: readonly MatchRecord[];
  /** the same person last season (joined on fpl's stable code); empty if new to the league */
  lastSeason: readonly MatchRecord[];
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
  /** one per fixture, in the order given */
  pointsIfPlaying: number[];
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
  const pointsIfPlaying = pointsFeatures(input).map((features) =>
    // a player who gets on scores at least 0; the fit is linear, so keep it there
    Math.max(0, dot(weights.pointsIfPlaying, features)),
  );
  const expectedPoints = pointsIfPlaying.reduce(
    (sum, points) => sum + chanceOfPlaying * points,
    0,
  );
  return { chanceOfPlaying, pointsIfPlaying, expectedPoints };
}

/** what decides whether the player gets on at all */
export function playFeatures(input: ProjectionInput): PlayFeatures {
  const priorAppearance = shrink(
    countWhere(input.lastSeason, appeared),
    input.lastSeason.length,
    input.league.appearanceShare,
    PRIOR_APPEARANCES,
  );
  const priorStart = shrink(
    countWhere(input.lastSeason, started),
    input.lastSeason.length,
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
  const { position, league } = input;
  const lastApps = input.lastSeason.filter(appeared);
  const apps = input.thisSeason.filter(appeared);

  const priorPoints = shrink(
    sumOf(lastApps, (match) => match.totalPoints),
    lastApps.length,
    league.pointsPerAppearance[position],
    PRIOR_APPEARANCES,
  );
  const season = shrink(
    sumOf(apps, (match) => match.totalPoints),
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
      sumOf(formApps, (match) => match.totalPoints),
      formApps.length,
      season,
      RECENT_PRIOR_WEIGHT,
    ),
    lastThreePointsPerAppearance: shrink(
      sumOf(lastThreeApps, (match) => match.totalPoints),
      lastThreeApps.length,
      season,
      RECENT_PRIOR_WEIGHT,
    ),
    attackingPointsPerAppearance: attackingPointsPerAppearance(input, lastApps, apps),
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
  lastApps: readonly MatchRecord[],
  apps: readonly MatchRecord[],
): number {
  const { position, league } = input;
  const priorMinutes = shrink(
    sumOf(lastApps, (match) => match.minutes),
    lastApps.length,
    league.minutesPerAppearance[position],
    PRIOR_APPEARANCES,
  );
  const minutesPerAppearance = shrink(
    sumOf(apps, (match) => match.minutes),
    apps.length,
    priorMinutes,
    PRIOR_APPEARANCES,
  );
  const recentApps = apps.slice(-RECENT_APPEARANCES_FOR_XGI);
  const goalsPer90 = blendedRatePer90(
    recentApps,
    lastApps,
    (match) => match.expectedGoals,
    league.expectedGoalsPer90[position],
  );
  const assistsPer90 = blendedRatePer90(
    recentApps,
    lastApps,
    (match) => match.expectedAssists,
    league.expectedAssistsPer90[position],
  );
  return (
    (goalsPer90 * GOAL_POINTS[position] + assistsPer90 * ASSIST_POINTS) *
    (minutesPerAppearance / 90)
  );
}

/** a per 90 rate: recent matches, blended with last season, blended with the league */
export function blendedRatePer90<M extends MatchRecord>(
  recent: readonly M[],
  lastSeason: readonly M[],
  read: (match: M) => number | null,
  leaguePer90: number,
): number {
  return ratePer90(recent, read, ratePer90(lastSeason, read, leaguePer90));
}

/** per 90, blended with a prior */
function ratePer90<M extends MatchRecord>(
  matches: readonly M[],
  read: (match: M) => number | null,
  prior: number,
): number {
  const { total, nineties } = per90Totals(matches, read);
  return shrink(total, nineties, prior, PRIOR_NINETIES);
}

/** a plain per 90 over a whole league season: enough minutes that no prior is needed */
export function leagueRatePer90<M extends MatchRecord>(
  matches: readonly M[],
  read: (match: M) => number | null,
): number {
  const { total, nineties } = per90Totals(matches, read);
  return nineties === 0 ? 0 : total / nineties;
}

/** matches with no expected stats are skipped, minutes and all */
function per90Totals<M extends MatchRecord>(
  matches: readonly M[],
  read: (match: M) => number | null,
): { total: number; nineties: number } {
  let total = 0;
  let minutes = 0;
  for (const match of matches) {
    const value = read(match);
    if (value === null) continue;
    total += value;
    minutes += match.minutes;
  }
  return { total, nineties: minutes / 90 };
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
    pointsPerAppearance: byPosition((m) => mean(m, (match) => match.totalPoints)),
    minutesPerAppearance: byPosition((m) => mean(m, (match) => match.minutes)),
    expectedGoalsPer90: byPosition((m) => per90(m, (match) => match.expectedGoals)),
    expectedAssistsPer90: byPosition((m) => per90(m, (match) => match.expectedAssists)),
    appearanceShare: countWhere(rows, appeared) / rows.length,
    startShare: countWhere(rows, started) / rows.length,
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
