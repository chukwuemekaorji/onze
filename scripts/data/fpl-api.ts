import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { asRecord, readArray, readBoolean, readInteger, readString } from '../../lib/dataset/fields.js';
import { normaliseFplApiSeason } from '../../lib/dataset/normalise-fpl-api.js';
import type { NormalisedSeason } from '../../lib/dataset/player-gameweek.js';
import { FPL_BASE_URL } from '../../lib/fpl-client.js';
import { ELEMENT_SUMMARY_DELAY_MS, RAW_DIR } from './config.js';
import { cachedDownload, fetchText, sleep, writeFileAtomically } from './http.js';

const PROGRESS_EVERY = 100;

/**
 * this season's per-player history from fpl's element-summary endpoint. raw
 * responses are cached under the last finished gameweek, so an interrupted run
 * resumes where it stopped and a new gameweek starts a fresh cache
 */
export async function buildCurrentSeason(): Promise<NormalisedSeason> {
  const freshBootstrap = await fetchText(`${FPL_BASE_URL}/bootstrap-static/`);
  const { season, lastFinishedGameweek } = describeSeason(JSON.parse(freshBootstrap));
  const cacheDir = join(RAW_DIR, 'fpl', season, `after-gw${lastFinishedGameweek}`);

  // the first bootstrap of a gameweek is kept, so a resumed run sees the same players
  const bootstrapPath = join(cacheDir, 'bootstrap-static.json');
  const bootstrapText = await readFile(bootstrapPath, 'utf8').catch(async () => {
    await writeFileAtomically(bootstrapPath, freshBootstrap);
    return freshBootstrap;
  });
  const bootstrap: unknown = JSON.parse(bootstrapText);
  const { text: fixturesText } = await cachedDownload(
    `${FPL_BASE_URL}/fixtures/`,
    join(cacheDir, 'fixtures.json'),
  );

  const playerIds = readArray(asRecord(bootstrap, 'bootstrap-static'), 'elements', 'bootstrap-static').map(
    (element) => readInteger(asRecord(element, 'element'), 'id', 'bootstrap-static element'),
  );
  const summaries = new Map<number, unknown>();
  let fetched = 0;
  for (const [index, playerId] of playerIds.entries()) {
    const { text, fromCache } = await cachedDownload(
      `${FPL_BASE_URL}/element-summary/${playerId}/`,
      join(cacheDir, 'element-summary', `${playerId}.json`),
    );
    summaries.set(playerId, JSON.parse(text));
    if (!fromCache) {
      fetched++;
      // polite: only downloads wait, cached files are read straight through
      await sleep(ELEMENT_SUMMARY_DELAY_MS);
    }
    if ((index + 1) % PROGRESS_EVERY === 0) {
      console.log(`  fpl ${season}: ${index + 1}/${playerIds.length} players (${fetched} downloaded)`);
    }
  }
  console.log(`  fpl ${season}: ${playerIds.length} players, ${fetched} downloaded, rest from cache`);

  return normaliseFplApiSeason({
    season,
    bootstrap,
    fixtures: JSON.parse(fixturesText),
    summaries,
  });
}

/** "2026-27" from the first deadline, plus the latest gameweek that has finished */
function describeSeason(bootstrap: unknown): {
  season: string;
  lastFinishedGameweek: number;
} {
  const events = readArray(asRecord(bootstrap, 'bootstrap-static'), 'events', 'bootstrap-static').map(
    (event) => asRecord(event, 'bootstrap-static event'),
  );
  const first = events[0];
  if (first === undefined) throw new Error('bootstrap-static has no gameweeks');
  const startYear = new Date(readString(first, 'deadline_time', 'first event')).getUTCFullYear();
  const season = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  const finished = events
    .filter((event) => readBoolean(event, 'finished', 'bootstrap-static event'))
    .map((event) => readInteger(event, 'id', 'bootstrap-static event'));
  return { season, lastFinishedGameweek: Math.max(0, ...finished) };
}
