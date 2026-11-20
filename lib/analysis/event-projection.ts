import {
  ASSIST_POINTS,
  CLEAN_SHEET_POINTS,
  FULL_APPEARANCE_POINTS,
  GOALS_CONCEDED_PER_PENALTY,
  GOAL_POINTS,
  SAVES_PER_POINT,
  SUB_APPEARANCE_POINTS,
  concedesPoints,
} from './fpl-scoring.js';
import type { EventPoints } from './fpl-scoring.js';
import { poissonExpectedFloor, poissonZero } from './poisson.js';
import {
  PLAY_FEATURES,
  RECENT_APPEARANCES_FOR_XGI,
  appeared,
  blendedRatePer90,
  dot,
  leaguePriorFrom,
  leagueRatePer90,
  logistic,
  playFeatures,
  shrink,
} from './projection.js';
import type {
  FixtureContext,
  LeaguePrior,
  MatchRecord,
  PlayFeatures,
  ProjectionInput,
} from './projection.js';
import type { FixtureGoalRates } from './team-strength.js';
import type { Position } from './types.js';

/**
 * expected fpl points built from the events that score them:
 *   chance of playing x the sum over fixtures of
 *   appearance + goals + assists + clean sheet + goals conceded + saves + bonus + other,
 * each expected count put through fpl's real scoring rules. goals, assists,
 * goals conceded and saves are poisson (see poisson.ts). the chance of playing
 * is the same model as projection.ts; the rest adds minutes, so that 60+
 * minutes (2 appearance points, clean sheets) is told apart from a cameo
 */

export interface EventMatchRecord extends MatchRecord {
  goalsScored: number;
  saves: number;
}

export interface EventFixture extends FixtureContext, FixtureGoalRates {}

export interface EventLeaguePrior extends LeaguePrior {
  /** keepers' saves per 90 last season */
  keeperSavesPer90: number;
}

export interface EventInput extends ProjectionInput {
  fixtures: readonly EventFixture[];
  thisSeason: readonly EventMatchRecord[];
  lastSeason: readonly EventMatchRecord[];
  league: EventLeaguePrior;
}

export const BONUS_FEATURES = [
  'appearance',
  'fullGame',
  'goals',
  'assists',
  'defensiveCleanSheet',
  'saves',
  'defensiveGoalsConceded',
] as const;
export type BonusFeature = (typeof BONUS_FEATURES)[number];
export type BonusFeatures = Record<BonusFeature, number>;

// keepers are almost never subbed, forwards often: the 60 minute line needs position
export const FULL_GAME_FEATURES = [
  ...PLAY_FEATURES,
  'defender',
  'midfielder',
  'forward',
] as const;
export type FullGameFeature = (typeof FULL_GAME_FEATURES)[number];
export type FullGameFeatures = Record<FullGameFeature, number>;

/**
 * each expected count times a league-wide scale fitted on the training season
 * (actual over predicted, which is the poisson maximum likelihood). they fix
 * what per 90 rates and poisson get wrong on average, such as fpl crediting
 * more assists than xa counts
 */
export interface EventScales {
  goals: number;
  assists: number;
  saves: number;
  goalsConceded: number;
  /** goals against as seen by the clean sheet chance: real goals clump, so 0 is rarer than poisson says */
  cleanSheet: number;
}

export interface EventWeights {
  /** logistic: log-odds of any minutes, as in projection.ts */
  chanceOfPlaying: PlayFeatures;
  /** logistic: log-odds of 60+ minutes, given the player gets on */
  fullGame: FullGameFeatures;
  scales: EventScales;
  /** average minutes of a 60+ appearance and of a shorter one */
  minutes: { full: number; short: number };
  /** xg of evidence a player's finishing is blended with: higher trusts xg more */
  finishingStrength: number;
  /** linear: bonus points from the match's events */
  bonus: BonusFeatures;
  /** cards, own goals and penalties: the average left after the events, per appearance */
  otherPoints: Record<Position, number>;
}

/** expected points from each scoring event, plus what the events leave out */
export interface PointsBreakdown extends EventPoints {
  other: number;
}

/** one fixture, given the player gets on */
export interface FixtureEvents {
  expectedMinutes: number;
  goals: number;
  assists: number;
  cleanSheetChance: number;
  goalsConceded: number;
  saves: number;
  points: PointsBreakdown;
  pointsIfPlaying: number;
}

export interface EventProjection {
  chanceOfPlaying: number;
  /** chance of 60+ minutes, given the player gets on */
  fullGameChance: number;
  fixtures: FixtureEvents[];
  expectedPoints: number;
}

export interface PlayerRates {
  goalsPer90: number;
  assistsPer90: number;
  /** 0 for anyone but a keeper */
  savesPer90: number;
}

// fpl gives one player at most 3 bonus points a match
const MAX_BONUS = 3;
const MINUTES_PER_MATCH = 90;

export function projectEvents(
  input: EventInput,
  weights: EventWeights,
): EventProjection {
  const chanceOfPlaying = logistic(dot(weights.chanceOfPlaying, playFeatures(input)));
  const fullGameChance = logistic(dot(weights.fullGame, fullGameFeatures(input)));
  const rates = playerRates(input, weights.finishingStrength);
  const fixtures = input.fixtures.map((fixture) =>
    fixtureEvents(input.position, fixture, rates, fullGameChance, weights),
  );
  const expectedPoints = fixtures.reduce(
    (sum, fixture) => sum + chanceOfPlaying * fixture.pointsIfPlaying,
    0,
  );
  return { chanceOfPlaying, fullGameChance, fixtures, expectedPoints };
}

export function fullGameFeatures(input: EventInput): FullGameFeatures {
  return {
    ...playFeatures(input),
    defender: input.position === 'DEF' ? 1 : 0,
    midfielder: input.position === 'MID' ? 1 : 0,
    forward: input.position === 'FWD' ? 1 : 0,
  };
}

/** per 90 rates before the fixture: recent form blended with last season and the league */
export function playerRates(input: EventInput, finishingStrength: number): PlayerRates {
  const { goals, expectedGoals } = finishingEvidence(input);
  return {
    goalsPer90:
      expectedGoalsPer90(input) * finishing(goals, expectedGoals, finishingStrength),
    assistsPer90: blendedRatePer90(
      recentAppearances(input),
      input.lastSeason.filter(appeared),
      (match) => match.expectedAssists,
      input.league.expectedAssistsPer90[input.position],
    ),
    savesPer90:
      input.position === 'GK'
        ? blendedRatePer90(
            input.thisSeason.filter(appeared),
            input.lastSeason.filter(appeared),
            (match) => match.saves,
            input.league.keeperSavesPer90,
          )
        : 0,
  };
}

export function expectedGoalsPer90(input: EventInput): number {
  return blendedRatePer90(
    recentAppearances(input),
    input.lastSeason.filter(appeared),
    (match) => match.expectedGoals,
    input.league.expectedGoalsPer90[input.position],
  );
}

/** goals and xg over last season and this one, where xg was recorded */
export function finishingEvidence(input: EventInput): {
  goals: number;
  expectedGoals: number;
} {
  let goals = 0;
  let expectedGoals = 0;
  for (const match of [...input.lastSeason, ...input.thisSeason]) {
    if (match.expectedGoals === null) continue;
    goals += match.goalsScored;
    expectedGoals += match.expectedGoals;
  }
  return { goals, expectedGoals };
}

/**
 * goals per xg, shrunk toward 1 (finishing exactly at xg) by `strength` xg of
 * evidence. most over- and under-performance of xg is luck, so it should take
 * a lot of xg before a player's own ratio counts for much
 */
export function finishing(
  goals: number,
  expectedGoals: number,
  strength: number,
): number {
  return shrink(goals, expectedGoals, 1, strength);
}

/** the events behind bonus, as features. linear, so expected events give expected bonus */
export function bonusFeatures(
  position: Position,
  events: {
    fullGame: number;
    goals: number;
    assists: number;
    cleanSheet: number;
    saves: number;
    goalsConceded: number;
  },
): BonusFeatures {
  const defensive = concedesPoints(position);
  return {
    appearance: 1,
    fullGame: events.fullGame,
    goals: events.goals,
    assists: events.assists,
    defensiveCleanSheet: defensive ? events.cleanSheet : 0,
    saves: position === 'GK' ? events.saves : 0,
    defensiveGoalsConceded: defensive ? events.goalsConceded : 0,
  };
}

function fixtureEvents(
  position: Position,
  fixture: EventFixture,
  rates: PlayerRates,
  fullGameChance: number,
  weights: EventWeights,
): FixtureEvents {
  const { full, short } = weights.minutes;
  const { scales } = weights;
  const expectedMinutes = fullGameChance * full + (1 - fullGameChance) * short;
  const nineties = expectedMinutes / MINUTES_PER_MATCH;
  const per90 = eventRatesPer90(rates, fixture, scales);
  const goals = per90.goals * nineties;
  const assists = per90.assists * nineties;
  const savesPer90 = per90.saves;
  const againstPer90 = per90.goalsConceded;
  // a clean sheet needs 60+ minutes and no goal while on the pitch
  const cleanSheetChance =
    fullGameChance *
    poissonZero(
      (fixture.expectedGoalsAgainst * scales.cleanSheet * full) / MINUTES_PER_MATCH,
    );
  // steps are worked out for a full game and a short one separately, then mixed
  const stepped = (per90: number, divisor: number) =>
    fullGameChance * poissonExpectedFloor((per90 * full) / MINUTES_PER_MATCH, divisor) +
    (1 - fullGameChance) *
      poissonExpectedFloor((per90 * short) / MINUTES_PER_MATCH, divisor);
  const goalsConceded = againstPer90 * nineties;
  const saves = savesPer90 * nineties;

  const bonus = Math.min(
    MAX_BONUS,
    Math.max(
      0,
      dot(
        weights.bonus,
        bonusFeatures(position, {
          fullGame: fullGameChance,
          goals,
          assists,
          cleanSheet: cleanSheetChance,
          saves,
          goalsConceded,
        }),
      ),
    ),
  );
  const points: PointsBreakdown = {
    appearance:
      fullGameChance * FULL_APPEARANCE_POINTS +
      (1 - fullGameChance) * SUB_APPEARANCE_POINTS,
    goals: goals * GOAL_POINTS[position],
    assists: assists * ASSIST_POINTS,
    cleanSheet: cleanSheetChance * CLEAN_SHEET_POINTS[position],
    goalsConceded: concedesPoints(position)
      ? -stepped(againstPer90, GOALS_CONCEDED_PER_PENALTY)
      : 0,
    saves: position === 'GK' ? stepped(savesPer90, SAVES_PER_POINT) : 0,
    bonus,
    other: weights.otherPoints[position],
  };
  const pointsIfPlaying = Object.values(points).reduce((sum, value) => sum + value, 0);
  return {
    expectedMinutes,
    goals,
    assists,
    cleanSheetChance,
    goalsConceded,
    saves,
    points,
    pointsIfPlaying,
  };
}

/** each event's expected count per 90 in this fixture, scales applied */
export function eventRatesPer90(
  rates: PlayerRates,
  fixture: FixtureGoalRates,
  scales: EventScales,
): { goals: number; assists: number; saves: number; goalsConceded: number } {
  return {
    goals: rates.goalsPer90 * fixture.scoringMultiplier * scales.goals,
    assists: rates.assistsPer90 * fixture.scoringMultiplier * scales.assists,
    saves: rates.savesPer90 * fixture.opponentAttackMultiplier * scales.saves,
    goalsConceded: fixture.expectedGoalsAgainst * scales.goalsConceded,
  };
}

function recentAppearances(input: EventInput): EventMatchRecord[] {
  return input.thisSeason.filter(appeared).slice(-RECENT_APPEARANCES_FOR_XGI);
}

/** last season's league averages, with keepers' saves on top */
export function eventLeaguePriorFrom(
  rows: readonly (EventMatchRecord & { position: Position })[],
): EventLeaguePrior {
  return {
    ...leaguePriorFrom(rows),
    keeperSavesPer90: leagueRatePer90(
      rows.filter((row) => row.position === 'GK' && appeared(row)),
      (row) => row.saves,
    ),
  };
}
