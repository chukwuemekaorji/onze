import type { Position } from '../analysis/types.js';

/** one player in one gameweek: the projection next to what happened */
export interface ScoredPlayer {
  position: Position;
  projected: number;
  actual: number;
  minutes: number;
}

export const TOP_PICKS = 5;
export const CAPTAIN_POOL = 20;

export type MetricId =
  | 'maePlayed'
  | 'rmsePlayed'
  | 'maeAll'
  | 'rmseAll'
  | 'spearman'
  | 'spearmanPlayed'
  | 'topFive'
  | 'captainRegret';

export interface MetricDefinition {
  id: MetricId;
  label: string;
  better: 'lower' | 'higher';
}

export const METRICS: readonly MetricDefinition[] = [
  { id: 'maePlayed', label: 'MAE, played', better: 'lower' },
  { id: 'rmsePlayed', label: 'RMSE, played', better: 'lower' },
  { id: 'maeAll', label: 'MAE, everyone', better: 'lower' },
  { id: 'rmseAll', label: 'RMSE, everyone', better: 'lower' },
  { id: 'spearman', label: 'Spearman, by position', better: 'higher' },
  // the same, only over players who got on: who scores, without who plays
  { id: 'spearmanPlayed', label: 'Spearman, played', better: 'higher' },
  { id: 'topFive', label: `Top-${TOP_PICKS} hit`, better: 'higher' },
  { id: 'captainRegret', label: 'Captain regret', better: 'lower' },
];

/**
 * a metric kept as a running sum and count, so gameweeks can be pooled and
 * resampled: mae pools absolute errors over player-gameweeks, spearman over
 * position-gameweek groups, top picks and regret over gameweeks
 */
export interface MetricPart {
  sum: number;
  count: number;
}

export type GameweekParts = Record<MetricId, MetricPart>;

export function meanAbsoluteError(players: readonly ScoredPlayer[]): number | null {
  return players.length === 0 ? null : sumAbsoluteError(players) / players.length;
}

export function rootMeanSquaredError(players: readonly ScoredPlayer[]): number | null {
  return players.length === 0
    ? null
    : Math.sqrt(sumSquaredError(players) / players.length);
}

/** ranks from 1, tied values sharing the average of the ranks they span */
export function averageRanks(values: readonly number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]?.value === order[start]?.value)
      end += 1;
    const shared = (start + end) / 2 + 1;
    for (let position = start; position <= end; position += 1) {
      const entry = order[position];
      if (entry !== undefined) ranks[entry.index] = shared;
    }
    start = end + 1;
  }
  return ranks;
}

/** null when it is undefined: fewer than two values, or either side all equal */
export function spearmanRankCorrelation(
  xs: readonly number[],
  ys: readonly number[],
): number | null {
  if (xs.length !== ys.length)
    throw new Error('spearman needs two lists of the same length');
  if (xs.length < 2) return null;
  return pearson(averageRanks(xs), averageRanks(ys));
}

/**
 * average actual points of the k highest projected. ties at the cut are not
 * broken by id (that would quietly favour arsenal, who have the lowest ids);
 * the open places get the tied group's mean, which is what picking among them
 * at random would score on average
 */
export function topProjectedMeanActual(
  players: readonly ScoredPlayer[],
  k: number,
): number | null {
  const picks = Math.min(k, players.length);
  if (picks === 0) return null;
  const sorted = byProjectionDescending(players);
  const cut = sorted[picks - 1]?.projected ?? 0;
  const above = sorted.filter((player) => player.projected > cut);
  const tied = sorted.filter((player) => player.projected === cut);
  const total =
    sumActual(above) + (picks - above.length) * (sumActual(tied) / tied.length);
  return total / picks;
}

/**
 * best actual score among the top `poolSize` projected, minus the actual score
 * of the top projected player (the captain). 0 means the captain was the right
 * call from that shortlist. ties: the captain is the tied group's mean, and the
 * shortlist takes in everyone tied at its cut
 */
export function captainRegret(
  players: readonly ScoredPlayer[],
  poolSize: number,
): number | null {
  if (players.length === 0) return null;
  const sorted = byProjectionDescending(players);
  const best = sorted[0]?.projected ?? 0;
  const captains = sorted.filter((player) => player.projected === best);
  const cut = sorted[Math.min(poolSize, sorted.length) - 1]?.projected ?? best;
  const pool = sorted.filter((player) => player.projected >= cut);
  const bestInPool = Math.max(...pool.map((player) => player.actual));
  return bestInPool - sumActual(captains) / captains.length;
}

/** every metric for one gameweek, as pooled parts */
export function scoreGameweek(players: readonly ScoredPlayer[]): GameweekParts {
  const played = players.filter((player) => player.minutes > 0);
  const spearman = spearmanByPosition(players);
  const spearmanPlayed = spearmanByPosition(played);
  return {
    maePlayed: { sum: sumAbsoluteError(played), count: played.length },
    rmsePlayed: { sum: sumSquaredError(played), count: played.length },
    maeAll: { sum: sumAbsoluteError(players), count: players.length },
    rmseAll: { sum: sumSquaredError(players), count: players.length },
    spearman: { sum: spearman.reduce((a, b) => a + b, 0), count: spearman.length },
    spearmanPlayed: {
      sum: spearmanPlayed.reduce((a, b) => a + b, 0),
      count: spearmanPlayed.length,
    },
    topFive: single(topProjectedMeanActual(players, TOP_PICKS)),
    captainRegret: single(captainRegret(players, CAPTAIN_POOL)),
  };
}

/** a metric over many gameweeks; null when no gameweek could score it */
export function metricValue(
  id: MetricId,
  gameweeks: readonly GameweekParts[],
): number | null {
  let sum = 0;
  let count = 0;
  for (const parts of gameweeks) {
    sum += parts[id].sum;
    count += parts[id].count;
  }
  if (count === 0) return null;
  const mean = sum / count;
  return id === 'rmsePlayed' || id === 'rmseAll' ? Math.sqrt(mean) : mean;
}

function spearmanByPosition(players: readonly ScoredPlayer[]): number[] {
  const groups = new Map<Position, ScoredPlayer[]>();
  for (const player of players) {
    const group = groups.get(player.position);
    if (group === undefined) groups.set(player.position, [player]);
    else group.push(player);
  }
  const correlations: number[] = [];
  for (const group of groups.values()) {
    const rho = spearmanRankCorrelation(
      group.map((player) => player.projected),
      group.map((player) => player.actual),
    );
    if (rho !== null) correlations.push(rho);
  }
  return correlations;
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const meanX = mean(xs);
  const meanY = mean(ys);
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  xs.forEach((x, index) => {
    const y = ys[index] ?? 0;
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  });
  if (varianceX === 0 || varianceY === 0) return null;
  return covariance / Math.sqrt(varianceX * varianceY);
}

function single(value: number | null): MetricPart {
  return value === null ? { sum: 0, count: 0 } : { sum: value, count: 1 };
}

function byProjectionDescending(players: readonly ScoredPlayer[]): ScoredPlayer[] {
  return [...players].sort((a, b) => b.projected - a.projected);
}

function sumAbsoluteError(players: readonly ScoredPlayer[]): number {
  return players.reduce(
    (sum, player) => sum + Math.abs(player.projected - player.actual),
    0,
  );
}

function sumSquaredError(players: readonly ScoredPlayer[]): number {
  return players.reduce(
    (sum, player) => sum + (player.projected - player.actual) ** 2,
    0,
  );
}

function sumActual(players: readonly ScoredPlayer[]): number {
  return players.reduce((sum, player) => sum + player.actual, 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
