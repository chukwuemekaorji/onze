import { join } from 'node:path';

// pinned so a rebuild reads exactly the same archive. bump it on purpose, and
// expect backtest numbers to move when you do
export const VAASTAV_COMMIT = 'd7b05b51d137bfefef4b692386d18c610975b9b9';
export const VAASTAV_RAW_BASE = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/${VAASTAV_COMMIT}/data`;

/** the last three completed seasons; the current one comes from fpl's api */
export const VAASTAV_SEASONS = ['2023-24', '2024-25', '2025-26'] as const;

export const DATA_DIR = join(import.meta.dirname, '..', '..', 'data');
export const RAW_DIR = join(DATA_DIR, 'raw');
export const DERIVED_DIR = join(DATA_DIR, 'derived');
export const FIXTURE_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'dataset',
);

// about 800 players at one call each: a few minutes, and gentle on fpl
export const ELEMENT_SUMMARY_DELAY_MS = 300;
export const FETCH_ATTEMPTS = 4;
export const RETRY_BASE_DELAY_MS = 2_000;
