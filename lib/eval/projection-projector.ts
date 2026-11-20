import {
  PLAY_FEATURES,
  POINTS_FEATURES,
  leaguePriorFrom,
  playFeatures,
  pointsFeatures,
  projectPlayer,
  summariseSeason,
} from '../analysis/projection.js';
import type {
  LeaguePrior,
  PlayFeature,
  PointsFeature,
  ProjectionInput,
  ProjectionWeights,
} from '../analysis/projection.js';
import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';
import type { Projector } from './baselines.js';
import { fitLogistic, fitRidge } from './fit.js';
import type { Example } from './fit.js';
import type {
  GameweekCase,
  HistoryView,
  PlayerTarget,
  SeasonRows,
} from './snapshot.js';

// computed once per season: every gameweek of a season shares the same last season
const priorCache = new WeakMap<SeasonRows, LeaguePrior>();

function leaguePriorFor(history: HistoryView): LeaguePrior {
  const lastSeason = history.lastSeason;
  if (lastSeason === null) {
    throw new Error(
      `${history.season} has no last season loaded; the projection starts from it`,
    );
  }
  const cached = priorCache.get(lastSeason);
  if (cached !== undefined) return cached;
  const prior = leaguePriorFrom(lastSeason.rows);
  priorCache.set(lastSeason, prior);
  return prior;
}

/** the model's input, read only from the leak-proof view and the target */
export function projectionInputFor(
  target: PlayerTarget,
  history: HistoryView,
): ProjectionInput {
  return {
    season: history.season,
    position: target.position,
    nowCost: target.nowCost,
    deadline: history.firstKickoff,
    fixtures: target.fixtures,
    thisSeason: history.playerRows(target.playerId),
    lastSeason: summariseSeason(
      history.lastSeasonRows(target.playerCode),
      target.position,
    ),
    league: leaguePriorFor(history),
  };
}

export function projectionProjector(
  weights: ProjectionWeights,
  label: string,
): Projector {
  return {
    id: 'projection',
    label,
    describe:
      'chance of playing x expected points if playing, a fitted blend of the features below',
    project: (target, history) =>
      projectPlayer(projectionInputFor(target, history), weights).expectedPoints,
  };
}

export interface TrainingSet {
  play: Example<PlayFeature>[];
  points: Example<PointsFeature>[];
}

/**
 * one example per player per fixture of a training season. the features come
 * from the same leak-proof view the harness uses; the targets come from that
 * fixture's row, which fitting is allowed to read
 */
export function trainingSet(
  cases: readonly GameweekCase[],
  seasonRows: readonly PlayerGameweekRow[],
): TrainingSet {
  const rowByFixture = new Map(
    seasonRows.map((row) => [`${row.playerId}/${row.fixtureId}`, row]),
  );
  const set: TrainingSet = { play: [], points: [] };
  for (const { history, targets } of cases) {
    for (const target of targets) {
      const input = projectionInputFor(target, history);
      const play = playFeatures(input);
      const points = pointsFeatures(input);
      target.fixtures.forEach((fixture, index) => {
        const row = rowByFixture.get(`${target.playerId}/${fixture.fixtureId}`);
        const features = points[index];
        if (row === undefined || features === undefined) {
          throw new Error(
            `no row for player ${target.playerId} in fixture ${fixture.fixtureId}`,
          );
        }
        set.play.push({ features: play, target: row.minutes > 0 ? 1 : 0 });
        if (row.minutes > 0) set.points.push({ features, target: row.totalPoints });
      });
    }
  }
  return set;
}

// a light touch on the logistic fit: enough to keep it finite, not enough to bend it
export const PLAY_PENALTY = 1;

export function fitProjection(
  set: TrainingSet,
  pointsPenalty: number,
): ProjectionWeights {
  return {
    chanceOfPlaying: fitLogistic(set.play, {
      keys: PLAY_FEATURES,
      penalty: PLAY_PENALTY,
      unpenalised: ['intercept'],
    }),
    pointsIfPlaying: fitRidge(set.points, {
      keys: POINTS_FEATURES,
      penalty: pointsPenalty,
      unpenalised: ['goalkeeper', 'defender', 'midfielder', 'forward'],
    }),
  };
}

/** root mean squared error of the points-if-playing part, for choosing the penalty */
export function pointsIfPlayingError(
  weights: ProjectionWeights,
  examples: readonly Example<PointsFeature>[],
): number {
  let squared = 0;
  for (const example of examples) {
    let predicted = 0;
    for (const key of POINTS_FEATURES) {
      predicted += weights.pointsIfPlaying[key] * example.features[key];
    }
    squared += (Math.max(0, predicted) - example.target) ** 2;
  }
  return Math.sqrt(squared / examples.length);
}
