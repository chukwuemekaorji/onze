/**
 * what each policy sees at a deadline: every player in the game as the app's
 * AnalysisPlayer, with points for the next few weeks from the model (the
 * blend, from history before the deadline only) or from fpl's form. the
 * app's transfer logic and planner then run on these exactly as they do live
 */

import { projectEvents } from '../analysis/event-projection.js';
import { projectPlayer } from '../analysis/projection.js';
import type { AnalysisPlayer, FixtureDifficulty } from '../analysis/types.js';
import type { ModelWeights } from '../build-projections.js';
import { form } from '../eval/baselines.js';
import { eventInputFor } from '../eval/event-projector.js';
import { projectionInputFor } from '../eval/projection-projector.js';
import type { FixtureOutlook, HistoryView, PlayerTarget } from '../eval/snapshot.js';
import { clubAt, fixturesOf, priceAt } from './season-data.js';
import type { SeasonData, SeasonPlayer } from './season-data.js';

/** the planner's look-ahead and the one-week logic's ranking horizon, as live */
export const PLAN_WEEKS = 5;
export const HORIZON_WEEKS = 3;

export type ViewKind = 'model' | 'form';

/** one player at one deadline: everything the two views are built from */
export interface PlayerPrediction {
  /** the blend's points for each of the next PLAN_WEEKS gameweeks */
  modelWeeks: number[];
  /** fpl's form per match times each week's number of fixtures */
  formWeeks: number[];
  chanceOfPlaying: number;
  pointsIfPlaying: number;
  formPerMatch: number;
  seasonPoints: number;
  seasonAppearances: number;
  /** left the game: no row from this gameweek on */
  departed: boolean;
}

// fpl's form is per match; one stand-in fixture reads the rate itself
const ONE_MATCH: readonly FixtureOutlook[] = [
  {
    fixtureId: 0,
    opponentTeamId: 0,
    opponentTeamName: '',
    wasHome: true,
    fixtureDifficulty: 3,
    kickoffTime: '',
  },
];

/**
 * every player who has arrived by the deadline. history is the harness's
 * leak-proof view of the rows before this gameweek; the fixture list ahead
 * is public before the season starts, so later weeks read it as is
 */
export function predictDeadline(
  data: SeasonData,
  gameweek: number,
  history: HistoryView,
  weights: ModelWeights,
): Map<number, PlayerPrediction> {
  const share = weights.twoPartShare;
  const predictions = new Map<number, PlayerPrediction>();
  for (const player of data.players.values()) {
    if (player.firstGameweek > gameweek) continue;
    const rows = history.playerRows(player.id);
    const seasonPoints = rows.reduce((sum, row) => sum + row.totalPoints, 0);
    const seasonAppearances = rows.filter((row) => row.minutes > 0).length;
    const departed = gameweek > player.lastGameweek;
    if (departed) {
      const none = new Array<number>(PLAN_WEEKS).fill(0);
      predictions.set(player.id, {
        modelWeeks: none,
        formWeeks: none,
        chanceOfPlaying: 0,
        pointsIfPlaying: 0,
        formPerMatch: 0,
        seasonPoints,
        seasonAppearances,
        departed,
      });
      continue;
    }
    const base = targetFor(player, data, gameweek);
    const modelWeeks: number[] = [];
    const formWeeks: number[] = [];
    let chanceOfPlaying = 0;
    let pointsIfPlaying = 0;
    for (let week = 0; week < PLAN_WEEKS; week += 1) {
      const target = {
        ...base,
        fixtures: fixturesOf(data, base.teamName, gameweek + week),
      };
      const twoPart = projectPlayer(
        projectionInputFor(target, history),
        weights.twoPart,
      );
      const events = projectEvents(eventInputFor(target, history), weights.event);
      modelWeeks.push(
        share * twoPart.expectedPoints + (1 - share) * events.expectedPoints,
      );
      formWeeks.push(form.project(target, history) ?? 0);
      if (week === 0) {
        chanceOfPlaying =
          share * twoPart.chanceOfPlaying + (1 - share) * events.chanceOfPlaying;
        const twoPartIfPlaying = twoPart.pointsIfPlaying.reduce((a, b) => a + b, 0);
        const eventIfPlaying = events.fixtures.reduce(
          (sum, fixture) => sum + fixture.pointsIfPlaying,
          0,
        );
        pointsIfPlaying = share * twoPartIfPlaying + (1 - share) * eventIfPlaying;
      }
    }
    predictions.set(player.id, {
      modelWeeks,
      formWeeks,
      chanceOfPlaying,
      pointsIfPlaying,
      formPerMatch: form.project({ ...base, fixtures: ONE_MATCH }, history) ?? 0,
      seasonPoints,
      seasonAppearances,
      departed,
    });
  }
  return predictions;
}

/** what the harness hands a model about a player, as of this deadline */
function targetFor(
  player: SeasonPlayer,
  data: SeasonData,
  gameweek: number,
): PlayerTarget {
  const club = clubAt(player, gameweek);
  return {
    season: data.season,
    gameweek,
    playerId: player.id,
    playerCode: player.code,
    playerName: player.name,
    position: player.position,
    teamId: club.teamId,
    teamName: club.teamName,
    nowCost: priceAt(player, gameweek),
    fixtures: [],
    leaky: { fplExpectedPoints: null },
  };
}

/**
 * a player as the app sees him. the form view swaps the model's points for
 * form, and since a form-chaser reads no model, nobody looks like a rotation risk
 */
export function analysisPlayer(
  player: SeasonPlayer,
  prediction: PlayerPrediction,
  data: SeasonData,
  gameweek: number,
  kind: ViewKind,
): AnalysisPlayer {
  const club = clubAt(player, gameweek);
  const weeks = kind === 'model' ? prediction.modelWeeks : prediction.formWeeks;
  const points = weeks[0] ?? 0;
  return {
    id: player.id,
    webName: player.name,
    teamId: club.teamId,
    teamShortName: club.teamName,
    teamName: club.teamName,
    position: player.position,
    nowCost: priceAt(player, gameweek),
    form: prediction.formPerMatch,
    pointsPerGame:
      prediction.seasonAppearances === 0
        ? 0
        : prediction.seasonPoints / prediction.seasonAppearances,
    epNext: 0,
    projection: {
      event: gameweek,
      points,
      chanceOfPlaying: kind === 'model' ? prediction.chanceOfPlaying : 1,
      pointsIfPlaying: kind === 'model' ? prediction.pointsIfPlaying : points,
      goalOrAssistChance: null,
      cleanSheetChance: null,
      horizonPoints: weeks.slice(0, HORIZON_WEEKS).reduce((a, b) => a + b, 0),
      horizonEvents: HORIZON_WEEKS,
      weeklyPoints: [...weeks],
    },
    totalPoints: prediction.seasonPoints,
    selectedByPercent: 0,
    // fpl shows a departed player as unavailable before the deadline; that's
    // the only team news the archive lets the backtest know
    chanceOfPlayingNextRound: prediction.departed ? 0 : null,
    status: prediction.departed ? 'u' : 'a',
    costChangeEvent: 0,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    nextFixtures: nextFixtures(data, club.teamName, gameweek),
  };
}

function nextFixtures(
  data: SeasonData,
  teamName: string,
  gameweek: number,
): FixtureDifficulty[] {
  const fixtures: FixtureDifficulty[] = [];
  for (let week = 0; week < PLAN_WEEKS; week += 1) {
    for (const fixture of fixturesOf(data, teamName, gameweek + week)) {
      fixtures.push({
        event: gameweek + week,
        isHome: fixture.wasHome,
        difficulty: fixture.fixtureDifficulty,
        opponentShortName: fixture.opponentTeamName,
        opponentName: fixture.opponentTeamName,
      });
    }
  }
  return fixtures;
}
