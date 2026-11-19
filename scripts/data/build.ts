import { join } from 'node:path';
import { DROP_REASON_LABEL } from '../../lib/dataset/player-gameweek.js';
import type {
  DropReason,
  NormalisedSeason,
} from '../../lib/dataset/player-gameweek.js';
import { summariseSeason } from '../../lib/dataset/summarise.js';
import type { SeasonSummary } from '../../lib/dataset/summarise.js';
import { DERIVED_DIR, VAASTAV_COMMIT, VAASTAV_SEASONS } from './config.js';
import { buildCurrentSeason } from './fpl-api.js';
import { writeFileAtomically } from './http.js';
import { buildVaastavSeason } from './vaastav.js';

// npm run data:build: past seasons from vaastav, this one from fpl, one typed
// shape for both, written to data/derived/ (gitignored)
async function main(): Promise<void> {
  const seasons: NormalisedSeason[] = [];
  for (const season of VAASTAV_SEASONS) {
    console.log(`vaastav ${season}...`);
    seasons.push(await buildVaastavSeason(season));
  }
  console.log('fpl api, current season...');
  seasons.push(await buildCurrentSeason());

  const summaries = seasons.map(summariseSeason);
  for (const season of seasons) {
    await writeFileAtomically(
      join(DERIVED_DIR, `player-gameweeks-${season.season}.json`),
      JSON.stringify(season.rows),
    );
  }
  await writeFileAtomically(
    join(DERIVED_DIR, 'manifest.json'),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        vaastavCommit: VAASTAV_COMMIT,
        seasons: summaries,
      },
      null,
      2,
    ),
  );
  printSummary(summaries);
}

function printSummary(summaries: readonly SeasonSummary[]): void {
  console.log('\ndataset built in data/derived/');
  console.table(
    summaries.map((summary) => ({
      season: summary.season,
      gameweeks: `${summary.gameweeks} (${summary.firstGameweek ?? '-'} to ${summary.lastGameweek ?? '-'})`,
      players: summary.players,
      rows: summary.rows,
      'rows with minutes': summary.rowsWithMinutes,
    })),
  );
  const total = summaries.reduce((sum, summary) => sum + summary.rows, 0);
  console.log(`total rows: ${total}`);

  const dropLines = summaries.flatMap((summary) =>
    (Object.entries(summary.dropped) as [DropReason, number][]).map(
      ([reason, count]) =>
        `  ${summary.season}: ${count} dropped, ${DROP_REASON_LABEL[reason]}`,
    ),
  );
  console.log(
    dropLines.length === 0
      ? 'no rows dropped'
      : `dropped rows:\n${dropLines.join('\n')}`,
  );
}

main().catch((error: unknown) => {
  // fail loudly: a half-built dataset must not look finished
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
