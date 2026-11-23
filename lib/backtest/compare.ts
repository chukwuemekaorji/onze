/**
 * how two policies compare over whole seasons, paired: the same start squads,
 * the same gameweeks. the interval resamples whole gameweeks within each
 * season, as the eval harness does, so it carries the week-to-week luck that
 * every start squad shares, not just how much the squads differ
 */

import { quantile, seededRandom } from '../eval/bootstrap.js';
import type { BootstrapOptions, Interval } from '../eval/bootstrap.js';
import type { SeasonRun } from './simulate.js';

export interface PairedDifference {
  /** a minus b in season points per start squad, the seasons averaged */
  value: number;
  interval: Interval;
  bySeason: { season: string; value: number; interval: Interval }[];
}

/** each season's gameweeks: the start squads' average of a minus b that week */
function weeklyGaps(
  a: readonly SeasonRun[],
  b: readonly SeasonRun[],
): Map<string, number[]> {
  const byKey = new Map(b.map((run) => [`${run.season}/${run.squadNumber}`, run]));
  const sums = new Map<string, { gaps: number[]; squads: number }>();
  for (const run of a) {
    const other = byKey.get(`${run.season}/${run.squadNumber}`);
    if (other === undefined || other.weeks.length !== run.weeks.length) {
      throw new Error(`no paired run for ${run.season} squad ${run.squadNumber}`);
    }
    const entry = sums.get(run.season) ?? {
      gaps: new Array<number>(run.weeks.length).fill(0),
      squads: 0,
    };
    run.weeks.forEach((week, index) => {
      const paired = other.weeks[index];
      if (paired === undefined || paired.gameweek !== week.gameweek) {
        throw new Error(`${run.season} squad ${run.squadNumber} weeks don't line up`);
      }
      entry.gaps[index] =
        (entry.gaps[index] ?? 0) +
        week.points -
        week.hitCost -
        (paired.points - paired.hitCost);
    });
    entry.squads += 1;
    sums.set(run.season, entry);
  }
  if (sums.size === 0) throw new Error('nothing to compare');
  return new Map(
    [...sums].map(([season, { gaps, squads }]) => [
      season,
      gaps.map((gap) => gap / squads),
    ]),
  );
}

export function pairedDifference(
  a: readonly SeasonRun[],
  b: readonly SeasonRun[],
  options: BootstrapOptions,
): PairedDifference {
  const gaps = weeklyGaps(a, b);
  const seasons = [...gaps.keys()].sort();
  const total = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0);
  const random = seededRandom(options.seed);
  const pooled: number[] = [];
  const perSeason = new Map<string, number[]>(seasons.map((season) => [season, []]));
  for (let resample = 0; resample < options.resamples; resample += 1) {
    let sum = 0;
    for (const season of seasons) {
      const weeks = gaps.get(season) ?? [];
      let seasonTotal = 0;
      for (let draw = 0; draw < weeks.length; draw += 1) {
        seasonTotal += weeks[Math.floor(random() * weeks.length)] ?? 0;
      }
      perSeason.get(season)?.push(seasonTotal);
      sum += seasonTotal;
    }
    pooled.push(sum / seasons.length);
  }
  const intervalOf = (values: number[]): Interval => {
    const sorted = [...values].sort((x, y) => x - y);
    const tail = (1 - options.level) / 2;
    return { low: quantile(sorted, tail), high: quantile(sorted, 1 - tail) };
  };
  return {
    value:
      seasons.reduce((sum, season) => sum + total(gaps.get(season) ?? []), 0) /
      seasons.length,
    interval: intervalOf(pooled),
    bySeason: seasons.map((season) => ({
      season,
      value: total(gaps.get(season) ?? []),
      interval: intervalOf(perSeason.get(season) ?? []),
    })),
  };
}

export type Reading = 'better' | 'worse' | 'unclear';

/** a minus b: clearly better or worse only when the interval excludes 0 */
export function readDifference(
  difference: Pick<PairedDifference, 'interval'>,
): Reading {
  if (difference.interval.low > 0) return 'better';
  if (difference.interval.high < 0) return 'worse';
  return 'unclear';
}

/** the pre-registered headline: the planner ships unless it is clearly worse */
export function plannerShips(
  plannerMinusOneWeek: Pick<PairedDifference, 'interval'>,
): boolean {
  return readDifference(plannerMinusOneWeek) !== 'worse';
}
