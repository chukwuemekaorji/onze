/**
 * pure: the step 3 projection model run for every player in fpl's bootstrap,
 * with fpl's team news on top. runs on the server only, inside /api/summary;
 * the browser never loads the model, its weights or last season's prior
 */

import { availabilityFactor } from './analysis/availability.js';
import { projectPlayer } from './analysis/projection.js';
import type {
  FixtureContext,
  LeaguePrior,
  MatchRecord,
  ProjectionWeights,
  SeasonSummary,
} from './analysis/projection.js';
import type { PlayerProjection, PlayerStatus, Position } from './analysis/types.js';
import type { FplBootstrapStatic, FplElement, FplFixture } from './fpl-types.js';

/** the order a SeasonSummary is stored in, one short row per player */
export const SEASON_SUMMARY_FIELDS = [
  'matches',
  'appearances',
  'starts',
  'points',
  'minutes',
  'expectedGoals',
  'expectedGoalsMinutes',
  'expectedAssists',
  'expectedAssistsMinutes',
  'defensiveContribution',
  'defensiveContributionMinutes',
] as const satisfies readonly (keyof SeasonSummary)[];

/** last season, boiled down to what the model reads, keyed by fpl's stable player code */
export interface LastSeasonPrior {
  season: string;
  league: LeaguePrior;
  players: Readonly<Record<number, readonly number[]>>;
}

export function encodeSeasonSummary(summary: SeasonSummary): number[] {
  return SEASON_SUMMARY_FIELDS.map((field) => summary[field]);
}

export function decodeSeasonSummary(values: readonly number[]): SeasonSummary {
  if (values.length !== SEASON_SUMMARY_FIELDS.length) {
    throw new Error(
      `a season summary has ${SEASON_SUMMARY_FIELDS.length} numbers, got ${values.length}`,
    );
  }
  const read = (index: number) => values[index] ?? 0;
  return {
    matches: read(0),
    appearances: read(1),
    starts: read(2),
    points: read(3),
    minutes: read(4),
    expectedGoals: read(5),
    expectedGoalsMinutes: read(6),
    expectedAssists: read(7),
    expectedAssistsMinutes: read(8),
    defensiveContribution: read(9),
    defensiveContributionMinutes: read(10),
  };
}

const NEW_TO_THE_LEAGUE: SeasonSummary = decodeSeasonSummary(
  SEASON_SUMMARY_FIELDS.map(() => 0),
);

/** "2026-27" from the first gameweek's deadline; fpl's api never names the season */
export function seasonOf(bootstrap: FplBootstrapStatic): string {
  const first = bootstrap.events[0];
  const year =
    first === undefined ? Number.NaN : new Date(first.deadline_time).getUTCFullYear();
  if (!Number.isFinite(year))
    throw new Error('could not tell the season from fpl data');
  return seasonLabel(year);
}

export function previousSeason(season: string): string {
  const year = Number.parseInt(season.slice(0, 4), 10);
  if (!Number.isFinite(year)) throw new Error(`not a season label: ${season}`);
  return seasonLabel(year - 1);
}

function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export class StalePriorError extends Error {
  constructor(prior: string, season: string) {
    super(
      `the projection's last-season prior is ${prior}, but ${season} needs ${previousSeason(season)}. run npm run data:prior and redeploy`,
    );
    this.name = 'StalePriorError';
  }
}

export interface ProjectionOptions {
  /** the gameweek being planned */
  event: number;
  /** its deadline, iso */
  deadline: string;
  /** gameweeks summed into horizonPoints, the planned one first */
  horizonEvents: number;
  /** this season's matches before the deadline, by element id */
  history: ReadonlyMap<number, readonly MatchRecord[]>;
  prior: LastSeasonPrior;
  weights: ProjectionWeights;
}

const POSITION_BY_ELEMENT_TYPE: Record<number, Position> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

/** every player in the bootstrap, by element id */
export function buildPlayerProjections(
  bootstrap: FplBootstrapStatic,
  fixtures: readonly FplFixture[],
  status: (element: FplElement) => PlayerStatus,
  options: ProjectionOptions,
): Map<number, PlayerProjection> {
  const season = seasonOf(bootstrap);
  // a stale prior would quietly start everyone from the wrong season
  if (options.prior.season !== previousSeason(season)) {
    throw new StalePriorError(options.prior.season, season);
  }
  const projections = new Map<number, PlayerProjection>();
  for (const element of bootstrap.elements) {
    const position = POSITION_BY_ELEMENT_TYPE[element.element_type];
    if (position === undefined) {
      throw new Error(`Unknown FPL element_type id: ${element.element_type}`);
    }
    const encoded = options.prior.players[element.code];
    const base = {
      season,
      position,
      nowCost: element.now_cost,
      deadline: options.deadline,
      thisSeason: options.history.get(element.id) ?? [],
      lastSeason:
        encoded === undefined ? NEW_TO_THE_LEAGUE : decodeSeasonSummary(encoded),
      league: options.prior.league,
    };
    const news = availabilityFactor(
      status(element),
      element.chance_of_playing_next_round,
    );
    const projectEvent = (event: number) =>
      projectPlayer(
        { ...base, fixtures: fixturesFor(element.team, event, fixtures) },
        options.weights,
      );

    const planned = projectEvent(options.event);
    let horizonPoints = planned.expectedPoints * news;
    for (let offset = 1; offset < options.horizonEvents; offset += 1) {
      // team news is applied to every week of the horizon: an injury rarely
      // lasts exactly one gameweek, and a doubt is still a doubt next week
      horizonPoints += projectEvent(options.event + offset).expectedPoints * news;
    }
    projections.set(element.id, {
      event: options.event,
      points: planned.expectedPoints * news,
      chanceOfPlaying: planned.chanceOfPlaying * news,
      pointsIfPlaying: planned.pointsIfPlaying.reduce((sum, points) => sum + points, 0),
      defensiveContributionIfPlaying:
        planned.defensiveContributionIfPlaying * planned.pointsIfPlaying.length,
      horizonPoints,
      horizonEvents: options.horizonEvents,
    });
  }
  return projections;
}

/** the team's fixtures in one gameweek: two in a double, none in a blank */
function fixturesFor(
  teamId: number,
  event: number,
  fixtures: readonly FplFixture[],
): FixtureContext[] {
  return fixtures
    .filter(
      (fixture) =>
        fixture.event === event &&
        (fixture.team_h === teamId || fixture.team_a === teamId),
    )
    .map((fixture) => {
      const wasHome = fixture.team_h === teamId;
      return {
        wasHome,
        fixtureDifficulty: wasHome
          ? fixture.team_h_difficulty
          : fixture.team_a_difficulty,
      };
    });
}
