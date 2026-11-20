import { join } from 'node:path';
import { runBacktest } from '../../lib/eval/backtest.js';
import { BASELINES } from '../../lib/eval/baselines.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import { EVAL_SPLITS, assertTuneSeasons } from '../../lib/eval/splits.js';
import { writeFileAtomically } from '../data/http.js';
import { formatMarkdown } from './report.js';
import {
  BOOTSTRAP,
  RESULTS_DIR,
  failLoudly,
  printTable,
  readSeasons,
  readVaastavCommit,
  reportFor,
  writeFullOutput,
} from './shared.js';

// npm run eval:baselines: score the simple baselines on the tune seasons only
async function main(): Promise<void> {
  const seasons = [...EVAL_SPLITS.tune];
  assertTuneSeasons(seasons);
  const context = { vaastavCommit: await readVaastavCommit(), ...BOOTSTRAP };
  const loaded = await readSeasons(seasons);
  const cases = seasons.flatMap((season) => buildGameweekCases(loaded, season));

  const reports = BASELINES.map((projector) =>
    reportFor(projector, runBacktest(cases, projector), seasons),
  );

  await writeFileAtomically(
    join(RESULTS_DIR, 'baselines.md'),
    formatMarkdown(reports, context),
  );
  await writeFullOutput('baselines', reports, context);
  console.log(`baselines on the tune seasons (${seasons.join(', ')}), 95% intervals:`);
  printTable(reports);
  console.log('written: results/baselines.md and data/derived/eval/');
}

main().catch(failLoudly);
