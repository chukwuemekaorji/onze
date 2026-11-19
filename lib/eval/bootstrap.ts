export interface Interval {
  low: number;
  high: number;
}

export interface BootstrapOptions {
  resamples: number;
  seed: number;
  /** e.g. 0.95 */
  level: number;
}

/**
 * percentile bootstrap. the units are whole gameweeks, resampled with
 * replacement, because players in the same gameweek share fixtures, weather
 * and team news, so their errors are not independent. seeded, so a rerun
 * prints the same interval
 */
export function bootstrapInterval<T>(
  units: readonly T[],
  statistic: (sample: readonly T[]) => number | null,
  options: BootstrapOptions,
): Interval | null {
  if (units.length === 0) return null;
  const random = seededRandom(options.seed);
  const values: number[] = [];
  for (let resample = 0; resample < options.resamples; resample += 1) {
    const sample = units.map(() => units[Math.floor(random() * units.length)] as T);
    const value = statistic(sample);
    if (value !== null) values.push(value);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const tail = (1 - options.level) / 2;
  return { low: quantile(values, tail), high: quantile(values, 1 - tail) };
}

/** mulberry32: a tiny, well-mixed prng that is the same on every machine */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** linear interpolation between the two nearest sorted values */
export function quantile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const below = Math.floor(position);
  const lower = sorted[below] ?? 0;
  const upper = sorted[Math.min(below + 1, sorted.length - 1)] ?? lower;
  return lower + (upper - lower) * (position - below);
}
