import { join } from 'node:path';
import { parseCsv } from '../../lib/dataset/csv.js';
import { normaliseVaastavSeason } from '../../lib/dataset/normalise-vaastav.js';
import type { NormalisedSeason } from '../../lib/dataset/player-gameweek.js';
import { RAW_DIR, VAASTAV_COMMIT, VAASTAV_RAW_BASE } from './config.js';
import { cachedDownload } from './http.js';

const SEASON_FILES = {
  mergedGw: 'gws/merged_gw.csv',
  fixtures: 'fixtures.csv',
  teams: 'teams.csv',
} as const;

/** downloads (or reuses) one season's csvs at the pinned commit and normalises them */
export async function buildVaastavSeason(season: string): Promise<NormalisedSeason> {
  const [mergedGw, fixtures, teams] = await Promise.all(
    Object.values(SEASON_FILES).map(async (file) => {
      const { text } = await cachedDownload(
        `${VAASTAV_RAW_BASE}/${season}/${file}`,
        join(RAW_DIR, 'vaastav', VAASTAV_COMMIT, season, file),
      );
      return parseCsv(text, `vaastav ${season} ${file}`);
    }),
  );
  if (mergedGw === undefined || fixtures === undefined || teams === undefined) {
    throw new Error(`vaastav ${season}: a season file is missing`);
  }
  return normaliseVaastavSeason({ season, mergedGw, fixtures, teams });
}
