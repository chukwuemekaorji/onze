import type { GameweekResult, Projection } from './backtest.js';
import { bootstrapInterval } from './bootstrap.js';
import type { BootstrapOptions, Interval } from './bootstrap.js';
import { CAPTAIN_POOL, metricValue } from './metrics.js';
import type { MetricId, MetricPart } from './metrics.js';

export interface Difference {
  value: number | null;
  interval: Interval | null;
}

/**
 * a minus b, with both resampled on the same gameweeks each time. two models'
 * separate intervals can overlap while one is still reliably ahead, because
 * good and bad gameweeks are shared; this sees that
 */
export function pairedDifference<T extends GameweekKey>(
  a: readonly T[],
  b: readonly T[],
  value: (sample: readonly T[]) => number | null,
  options: BootstrapOptions,
): Difference {
  assertAligned(a, b);
  const indices = a.map((_, index) => index);
  const statistic = (sample: readonly number[]) => {
    const left = value(sample.map((index) => at(a, index)));
    const right = value(sample.map((index) => at(b, index)));
    return left === null || right === null ? null : left - right;
  };
  return {
    value: statistic(indices),
    interval: bootstrapInterval(indices, statistic, options),
  };
}

/** a minus b on one of the harness metrics */
export function pairedMetricDifference(
  a: readonly GameweekResult[],
  b: readonly GameweekResult[],
  id: MetricId,
  options: BootstrapOptions,
): Difference {
  return pairedDifference(
    a,
    b,
    (sample) =>
      metricValue(
        id,
        sample.map((result) => result.parts),
      ),
    options,
  );
}

export interface GameweekKey {
  season: string;
  gameweek: number;
}

// a double-digit return is what fpl players call a haul
export const HAUL_POINTS = 10;

export type HaulMetricId = 'captainHauled' | 'haulsShortlisted' | 'captainPoints';

export const HAUL_METRICS: readonly { id: HaulMetricId; label: string }[] = [
  { id: 'captainPoints', label: 'Captain, average points' },
  { id: 'captainHauled', label: `Captain scored ${HAUL_POINTS}+` },
  {
    id: 'haulsShortlisted',
    label: `${HAUL_POINTS}+ scores in the top ${CAPTAIN_POOL}`,
  },
];

export type HaulParts = Record<HaulMetricId, MetricPart>;

export interface GameweekHauls extends GameweekKey {
  parts: HaulParts;
}

/**
 * per gameweek, so they pool and resample like the other metrics. ties are
 * never broken by id, as in metrics.ts: the captain is the tied group's
 * average, and a haul tied at the shortlist's cut counts for the share of the
 * open places, what picking among the tied at random would give
 */
export function haulParts(projections: readonly Projection[]): GameweekHauls[] {
  return byGameweek(projections).map((players) => {
    const sorted = [...players].sort((x, y) => y.projected - x.projected);
    const captains = captainsOf(sorted);
    const places = Math.min(CAPTAIN_POOL, sorted.length);
    const cut = sorted[places - 1]?.projected ?? 0;
    const above = sorted.filter((player) => player.projected > cut).length;
    const tied = sorted.filter((player) => player.projected === cut).length;
    const tiedShare = (places - above) / tied;
    const hauls = sorted.filter((player) => player.actual >= HAUL_POINTS);
    const shortlisted = hauls.reduce(
      (sum, player) =>
        sum + (player.projected > cut ? 1 : player.projected === cut ? tiedShare : 0),
      0,
    );
    return {
      season: players[0]?.season ?? '',
      gameweek: players[0]?.gameweek ?? 0,
      parts: {
        captainPoints: { sum: averageActual(captains), count: 1 },
        captainHauled: {
          sum:
            captains.filter((player) => player.actual >= HAUL_POINTS).length /
            captains.length,
          count: 1,
        },
        haulsShortlisted: { sum: shortlisted, count: hauls.length },
      },
    };
  });
}

export function haulValue(
  id: HaulMetricId,
  gameweeks: readonly GameweekHauls[],
): number | null {
  let sum = 0;
  let count = 0;
  for (const { parts } of gameweeks) {
    sum += parts[id].sum;
    count += parts[id].count;
  }
  return count === 0 ? null : sum / count;
}

export function haulSummary(
  gameweeks: readonly GameweekHauls[],
  options: BootstrapOptions,
): { id: HaulMetricId; value: number | null; interval: Interval | null }[] {
  return HAUL_METRICS.map(({ id }) => ({
    id,
    value: haulValue(id, gameweeks),
    interval: bootstrapInterval(gameweeks, (sample) => haulValue(id, sample), options),
  }));
}

export interface CaptainDisagreement {
  gameweeks: number;
  /** gameweeks where the two captains differ */
  disagreements: number;
  /** average actual points of each side's captain in those gameweeks */
  aPoints: number | null;
  bPoints: number | null;
}

/** where two models pick different captains, whose pick scored more */
export function captainDisagreement(
  a: readonly Projection[],
  b: readonly Projection[],
): CaptainDisagreement {
  const left = byGameweek(a);
  const right = new Map(
    byGameweek(b).map((players) => [keyOf(players[0]), players] as const),
  );
  let disagreements = 0;
  let aTotal = 0;
  let bTotal = 0;
  for (const players of left) {
    const other = right.get(keyOf(players[0]));
    if (other === undefined)
      throw new Error('paired runs must score the same gameweeks');
    const ours = captainsOf(players);
    const theirs = captainsOf(other);
    const ids = (captains: readonly Projection[]) =>
      captains
        .map((player) => player.playerId)
        .sort((x, y) => x - y)
        .join(',');
    if (ids(ours) === ids(theirs)) continue;
    disagreements += 1;
    aTotal += averageActual(ours);
    bTotal += averageActual(theirs);
  }
  return {
    gameweeks: left.length,
    disagreements,
    aPoints: disagreements === 0 ? null : aTotal / disagreements,
    bPoints: disagreements === 0 ? null : bTotal / disagreements,
  };
}

/** how often each player was a model's captain, most often first */
export function captainCounts(
  projections: readonly Projection[],
): { season: string; playerId: number; gameweeks: number }[] {
  const counts = new Map<
    string,
    { season: string; playerId: number; gameweeks: number }
  >();
  for (const players of byGameweek(projections)) {
    for (const captain of captainsOf(players)) {
      const key = `${captain.season}/${captain.playerId}`;
      const entry = counts.get(key) ?? {
        season: captain.season,
        playerId: captain.playerId,
        gameweeks: 0,
      };
      entry.gameweeks += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((x, y) => y.gameweeks - x.gameweeks);
}

function byGameweek(projections: readonly Projection[]): Projection[][] {
  const groups = new Map<string, Projection[]>();
  for (const projection of projections) {
    const key = keyOf(projection);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [projection]);
    else group.push(projection);
  }
  return [...groups.values()];
}

function keyOf(key: GameweekKey | undefined): string {
  return key === undefined ? '' : `${key.season}/${key.gameweek}`;
}

function captainsOf(players: readonly Projection[]): Projection[] {
  const best = Math.max(...players.map((player) => player.projected));
  return players.filter((player) => player.projected === best);
}

function averageActual(players: readonly Projection[]): number {
  return players.reduce((sum, player) => sum + player.actual, 0) / players.length;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no gameweek at ${index}`);
  return item;
}

function assertAligned(a: readonly GameweekKey[], b: readonly GameweekKey[]): void {
  const same =
    a.length === b.length &&
    a.every(
      (key, index) =>
        key.season === b[index]?.season && key.gameweek === b[index]?.gameweek,
    );
  if (!same) {
    throw new Error('paired runs must score the same gameweeks in the same order');
  }
}
