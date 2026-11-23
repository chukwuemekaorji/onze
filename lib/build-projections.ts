/**
 * pure: onze's live prediction for every player in fpl's bootstrap. the
 * two-part model (projection.ts) and the event model (event-projection.ts)
 * each run with fpl's team news on their chance of playing, then blend by a
 * frozen share. runs on the server only, inside /api/summary; the browser
 * never loads the models, their weights or last season's prior
 */

import { availabilityFactor } from './analysis/availability.js';
import { projectEvents } from './analysis/event-projection.js';
import type {
  EventFixture,
  EventLeaguePrior,
  EventSeasonSummary,
  EventWeights,
} from './analysis/event-projection.js';
import { concedesPoints } from './analysis/fpl-scoring.js';
import { poissonZero } from './analysis/poisson.js';
import { projectPlayer } from './analysis/projection.js';
import type { ProjectionWeights } from './analysis/projection.js';
import { fixtureGoalRates, teamStrengths } from './analysis/team-strength.js';
import type { TeamSeasonSummary, TeamStrengths } from './analysis/team-strength.js';
import type { PlayerProjection, PlayerStatus, Position } from './analysis/types.js';
import type { MatchHistory } from './build-match-history.js';
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
  'goalsWhereExpected',
  'saves',
] as const satisfies readonly (keyof EventSeasonSummary)[];

/** last season, boiled down to what the models read, keyed by fpl's stable player code */
export interface LastSeasonPrior {
  season: string;
  league: EventLeaguePrior;
  teams: TeamSeasonSummary;
  players: Readonly<Record<number, readonly number[]>>;
}

export function encodeSeasonSummary(summary: EventSeasonSummary): number[] {
  return SEASON_SUMMARY_FIELDS.map((field) => summary[field]);
}

export function decodeSeasonSummary(values: readonly number[]): EventSeasonSummary {
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
    goalsWhereExpected: read(11),
    saves: read(12),
  };
}

const NEW_TO_THE_LEAGUE: EventSeasonSummary = decodeSeasonSummary(
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
      `the prediction's last-season prior is ${prior}, but ${season} needs ${previousSeason(season)}. run npm run data:prior and redeploy`,
    );
    this.name = 'StalePriorError';
  }
}

export interface ModelWeights {
  twoPart: ProjectionWeights;
  event: EventWeights;
  /** the two-part model's share of the blend, the event model's is the rest */
  twoPartShare: number;
}

export interface ProjectionOptions {
  /** the gameweek being planned */
  event: number;
  /** its deadline, iso */
  deadline: string;
  /** gameweeks summed into horizonPoints, the planned one first */
  horizonEvents: number;
  /** gameweeks predicted one by one for the planner, the planned one first */
  planEvents: number;
  /** this season's matches before the deadline */
  history: MatchHistory;
  prior: LastSeasonPrior;
  weights: ModelWeights;
}

const POSITION_BY_ELEMENT_TYPE: Record<number, Position> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

/** one gameweek for one player: the blended points and what the labels read */
interface GameweekPrediction {
  points: number;
  chanceOfPlaying: number;
  pointsIfPlaying: number;
  goalOrAssistChance: number | null;
  cleanSheetChance: number | null;
}

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
  const share = options.weights.twoPartShare;
  if (!(share >= 0 && share <= 1)) {
    throw new Error(`the two-part share must be from 0 to 1, got ${share}`);
  }
  const strengths = teamStrengths(options.history.teamMatches, options.prior.teams);
  const teamName = new Map(bootstrap.teams.map((team) => [team.id, team.name]));
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
      thisSeason: options.history.players.get(element.id) ?? [],
      lastSeason:
        encoded === undefined ? NEW_TO_THE_LEAGUE : decodeSeasonSummary(encoded),
      league: options.prior.league,
    };
    const news = availabilityFactor(
      status(element),
      element.chance_of_playing_next_round,
    );
    const predict = (event: number): GameweekPrediction => {
      const eventFixtures = fixturesFor(
        element.team,
        event,
        fixtures,
        strengths,
        teamName,
      );
      const input = { ...base, fixtures: eventFixtures };
      const twoPart = projectPlayer(input, options.weights.twoPart);
      const events = projectEvents(input, options.weights.event);
      // team news goes on each model's chance of playing before they blend
      const twoPartChance = twoPart.chanceOfPlaying * news;
      const eventChance = events.chanceOfPlaying * news;
      const twoPartIfPlaying = sum(twoPart.pointsIfPlaying);
      const eventIfPlaying = sum(
        events.fixtures.map((fixture) => fixture.pointsIfPlaying),
      );
      const blend = (a: number, b: number) => share * a + (1 - share) * b;
      const blank = eventFixtures.length === 0;
      return {
        points: blend(twoPartChance * twoPartIfPlaying, eventChance * eventIfPlaying),
        chanceOfPlaying: blend(twoPartChance, eventChance),
        pointsIfPlaying: blend(twoPartIfPlaying, eventIfPlaying),
        // the labels read the event model, the one that counts goals and clean sheets
        goalOrAssistChance: blank
          ? null
          : 1 -
            poissonZero(
              sum(events.fixtures.map((fixture) => fixture.goals + fixture.assists)),
            ),
        cleanSheetChance:
          blank || !concedesPoints(position)
            ? null
            : teamCleanSheetChance(eventFixtures, options.weights.event),
      };
    };

    const planned = predict(options.event);
    // team news is applied to every later week too: an injury rarely lasts
    // exactly one gameweek, and a doubt is still a doubt next week
    const weeklyPoints = [planned.points];
    const weeks = Math.max(options.horizonEvents, options.planEvents);
    for (let offset = 1; offset < weeks; offset += 1) {
      weeklyPoints.push(predict(options.event + offset).points);
    }
    projections.set(element.id, {
      event: options.event,
      ...planned,
      horizonPoints: sum(weeklyPoints.slice(0, options.horizonEvents)),
      horizonEvents: options.horizonEvents,
      weeklyPoints: weeklyPoints.slice(0, options.planEvents),
    });
  }
  return projections;
}

/**
 * the chance the team keeps at least one clean sheet in the gameweek, the
 * whole match rather than the player's minutes: it's the team's that a
 * manager weighs. goals against are scaled as the event model's clean sheets are
 */
function teamCleanSheetChance(
  fixtures: readonly EventFixture[],
  weights: EventWeights,
): number {
  const noneKept = fixtures.reduce(
    (product, fixture) =>
      product *
      (1 - poissonZero(fixture.expectedGoalsAgainst * weights.scales.cleanSheet)),
    1,
  );
  return 1 - noneKept;
}

/** the team's fixtures in one gameweek: two in a double, none in a blank */
function fixturesFor(
  teamId: number,
  event: number,
  fixtures: readonly FplFixture[],
  strengths: TeamStrengths,
  teamName: ReadonlyMap<number, string>,
): EventFixture[] {
  return fixtures
    .filter(
      (fixture) =>
        fixture.event === event &&
        (fixture.team_h === teamId || fixture.team_a === teamId),
    )
    .map((fixture) => {
      const wasHome = fixture.team_h === teamId;
      const opponentId = wasHome ? fixture.team_a : fixture.team_h;
      const own = teamName.get(teamId);
      const opponent = teamName.get(opponentId);
      if (own === undefined || opponent === undefined) {
        throw new Error(`fixture ${fixture.id} names a team fpl doesn't list`);
      }
      return {
        wasHome,
        fixtureDifficulty: wasHome
          ? fixture.team_h_difficulty
          : fixture.team_a_difficulty,
        ...fixtureGoalRates(strengths, own, opponent, wasHome),
      };
    });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
