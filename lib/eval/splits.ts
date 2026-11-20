/**
 * fixed before any result was looked at. tuning (choosing features, weights,
 * baselines to beat) only ever sees the tune seasons. the test season is
 * scored once, at the end, so its number is an honest out-of-sample estimate.
 * the prior season is read as history and never scored.
 * the live season is tracked as it happens
 */
export const EVAL_SPLITS = {
  // history only: last season for 2023-24's priors, never scored
  prior: ['2022-23'],
  tune: ['2023-24', '2024-25'],
  test: ['2025-26'],
  live: ['2026-27'],
} as const;

export type TuneSeason = (typeof EVAL_SPLITS.tune)[number];

export class LockedSeasonError extends Error {
  constructor(season: string) {
    super(
      `${season} is the locked test season; score it only once a model is final, never while tuning`,
    );
    this.name = 'LockedSeasonError';
  }
}

/** throws unless every season is a tune season, so a report can't peek at the test set */
export function assertTuneSeasons(
  seasons: readonly string[],
): asserts seasons is TuneSeason[] {
  const tune: readonly string[] = EVAL_SPLITS.tune;
  for (const season of seasons) {
    if (!tune.includes(season)) {
      if ((EVAL_SPLITS.test as readonly string[]).includes(season)) {
        throw new LockedSeasonError(season);
      }
      throw new Error(
        `${season} is not a tune season (${EVAL_SPLITS.tune.join(', ')})`,
      );
    }
  }
}
