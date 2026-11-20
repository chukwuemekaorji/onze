import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsv } from '../../lib/dataset/csv.js';
import { asRecord, readArray, readInteger } from '../../lib/dataset/fields.js';
import { FIXTURE_DIR, RAW_DIR, VAASTAV_COMMIT } from './config.js';
import { writeFileAtomically } from './http.js';

// npm run data:fixture: cuts a small slice of the raw downloads into
// test/fixtures/dataset/ so the normaliser tests and ci never download anything.
// needs a data:build first

// assistant managers only arrived at gameweek 24, so the tests add their own
const VAASTAV_SEASON = '2024-25';
const SLICE_GAMEWEEKS = new Set([1, 2]);
const SLICE_PLAYERS = 100;

// only what the normaliser reads, so the committed json stays small. a field
// missing here makes the normaliser tests fail loudly, not pass quietly
const HISTORY_FIELDS = [
  'fixture',
  'round',
  'opponent_team',
  'was_home',
  'kickoff_time',
  'total_points',
  'minutes',
  'starts',
  'goals_scored',
  'assists',
  'clean_sheets',
  'goals_conceded',
  'saves',
  'bonus',
  'bps',
  'expected_goals',
  'expected_assists',
  'expected_goals_conceded',
  'value',
];
const FIXTURE_FIELDS = [
  'id',
  'event',
  'team_h',
  'team_a',
  'team_h_difficulty',
  'team_a_difficulty',
  'finished',
  'kickoff_time',
];
const TEAM_FIELDS = ['id', 'name', 'short_name'];
// players_raw.csv has about 100 columns; the normaliser needs the id and code
const PLAYERS_RAW_FIELDS = ['id', 'code', 'first_name', 'second_name'];

function pick(record: Readonly<Record<string, unknown>>, fields: readonly string[]) {
  return Object.fromEntries(fields.map((field) => [field, record[field]]));
}

async function main(): Promise<void> {
  await sliceVaastav();
  await sliceFplApi();
  console.log(`slice written to ${FIXTURE_DIR}`);
}

async function sliceVaastav(): Promise<void> {
  const sourceDir = join(RAW_DIR, 'vaastav', VAASTAV_COMMIT, VAASTAV_SEASON);
  const read = async (file: string) =>
    parseCsv(await readFile(join(sourceDir, file), 'utf8'), file);
  const merged = (await read('gws/merged_gw.csv')).filter((row) =>
    SLICE_GAMEWEEKS.has(Number(row.round)),
  );
  // the lowest ids, so the slice is the same every time it's cut
  const keep = new Set(
    [...new Set(merged.map((row) => Number(row.element)))]
      .sort((a, b) => a - b)
      .slice(0, SLICE_PLAYERS),
  );
  const mergedSlice = merged.filter((row) => keep.has(Number(row.element)));
  const fixtureIds = new Set(mergedSlice.map((row) => row.fixture));
  const fixtures = (await read('fixtures.csv')).filter((row) => fixtureIds.has(row.id));

  const targetDir = join(FIXTURE_DIR, `vaastav-${VAASTAV_SEASON}`);
  await writeFileAtomically(join(targetDir, 'merged_gw.csv'), toCsv(mergedSlice));
  await writeFileAtomically(join(targetDir, 'fixtures.csv'), toCsv(fixtures));
  await writeFileAtomically(
    join(targetDir, 'teams.csv'),
    toCsv(await read('teams.csv')),
  );
  const players = (await read('players_raw.csv'))
    .filter((row) => keep.has(Number(row.id)))
    .map((row) => pick(row, PLAYERS_RAW_FIELDS) as Record<string, string>);
  await writeFileAtomically(join(targetDir, 'players_raw.csv'), toCsv(players));
}

async function sliceFplApi(): Promise<void> {
  const seasonDir = join(RAW_DIR, 'fpl');
  const season = (await readdir(seasonDir)).sort().at(-1);
  if (season === undefined)
    throw new Error('no fpl season cached; run data:build first');
  const snapshot = (await readdir(join(seasonDir, season)))
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
    .at(-1);
  if (snapshot === undefined) throw new Error(`no snapshot cached for ${season}`);
  const sourceDir = join(seasonDir, season, snapshot);
  const readJson = async (file: string): Promise<unknown> =>
    JSON.parse(await readFile(join(sourceDir, file), 'utf8'));

  const bootstrap = asRecord(await readJson('bootstrap-static.json'), 'bootstrap');
  const elements = readArray(bootstrap, 'elements', 'bootstrap')
    .map((element) => asRecord(element, 'element'))
    .sort((a, b) => readInteger(a, 'id', 'element') - readInteger(b, 'id', 'element'))
    .slice(0, SLICE_PLAYERS)
    // only the fields the normaliser reads, to keep the fixture small
    .map(({ id, code, first_name, second_name, element_type }) => ({
      id,
      code,
      first_name,
      second_name,
      element_type,
    }));

  const summaries: Record<string, unknown> = {};
  for (const { id } of elements) {
    const summary = asRecord(
      await readJson(join('element-summary', `${String(id)}.json`)),
      'summary',
    );
    summaries[String(id)] = {
      history: readArray(summary, 'history', 'summary')
        .map((entry) => asRecord(entry, 'entry'))
        .filter((entry) => SLICE_GAMEWEEKS.has(readInteger(entry, 'round', 'entry')))
        .map((entry) => pick(entry, HISTORY_FIELDS)),
    };
  }
  const fixtures = (await readJson('fixtures.json')) as unknown[];

  const targetDir = join(FIXTURE_DIR, `fpl-${season}`);
  const write = (file: string, value: unknown) =>
    writeFileAtomically(join(targetDir, file), `${JSON.stringify(value, null, 2)}\n`);
  await write('bootstrap-static.json', {
    teams: readArray(bootstrap, 'teams', 'bootstrap').map((team) =>
      pick(asRecord(team, 'team'), TEAM_FIELDS),
    ),
    element_types: bootstrap.element_types,
    elements,
  });
  await write(
    'fixtures.json',
    fixtures
      .map((fixture) => asRecord(fixture, 'fixture'))
      .filter((fixture) =>
        SLICE_GAMEWEEKS.has(readInteger(fixture, 'event', 'fixture')),
      )
      .map((fixture) => pick(fixture, FIXTURE_FIELDS)),
  );
  await write('element-summaries.json', summaries);
}

function toCsv(records: readonly Record<string, string>[]): string {
  const header = Object.keys(records[0] ?? {});
  const escape = (cell: string) =>
    /[",\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
  return `${[
    header,
    ...records.map((record) => header.map((name) => record[name] ?? '')),
  ]
    .map((cells) => cells.map(escape).join(','))
    .join('\n')}\n`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
