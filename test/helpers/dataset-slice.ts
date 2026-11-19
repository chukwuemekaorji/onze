import { readFileSync } from 'node:fs';
import { parseCsv } from '../../lib/dataset/csv.js';
import type { FplApiSeasonInput } from '../../lib/dataset/normalise-fpl-api.js';
import type { VaastavSeasonFiles } from '../../lib/dataset/normalise-vaastav.js';

// the committed slice cut by npm run data:fixture: 2 gameweeks x 100 players
// from each source, so these tests never download anything
const SLICE_DIR = new URL('../fixtures/dataset/', import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, SLICE_DIR), 'utf8');
}

export function vaastavSlice(): VaastavSeasonFiles {
  const csv = (file: string) => parseCsv(read(`vaastav-2024-25/${file}`), file);
  return {
    season: '2024-25',
    mergedGw: csv('merged_gw.csv'),
    fixtures: csv('fixtures.csv'),
    teams: csv('teams.csv'),
  };
}

export function fplApiSlice(): FplApiSeasonInput {
  const json = (file: string): unknown => JSON.parse(read(`fpl-2026-27/${file}`));
  const summaries = json('element-summaries.json') as Record<string, unknown>;
  return {
    season: '2026-27',
    bootstrap: json('bootstrap-static.json'),
    fixtures: json('fixtures.json'),
    summaries: new Map(
      Object.entries(summaries).map(([id, value]) => [Number(id), value]),
    ),
  };
}
