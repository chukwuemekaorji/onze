import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerGameweekRow } from '../../lib/dataset/player-gameweek.js';
import { runBacktest, summariseRun } from '../../lib/eval/backtest.js';
import { BASELINES } from '../../lib/eval/baselines.js';
import { METRICS } from '../../lib/eval/metrics.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { GameweekCase, SeasonRows } from '../../lib/eval/snapshot.js';
import { EVAL_SPLITS, assertTuneSeasons } from '../../lib/eval/splits.js';
import { DERIVED_DIR } from '../data/config.js';
import { writeFileAtomically } from '../data/http.js';
import { formatMarkdown, formatNumber } from './report.js';
import type { BaselineReport } from './report.js';

const RESULTS_FILE = join(import.meta.dirname, '..', '..', 'results', 'baselines.md');
const EVAL_OUTPUT_DIR = join(DERIVED_DIR, 'eval');
const BOOTSTRAP = { resamples: 2_000, seed: 2026, level: 0.95 };

// npm run eval:baselines: score the simple baselines on the tune seasons only
async function main(): Promise<void> {
  const seasons = [...EVAL_SPLITS.tune];
  assertTuneSeasons(seasons);
  const manifest = await readManifest();
  const loaded: SeasonRows[] = [];
  for (const season of seasons) loaded.push({ season, rows: await readSeason(season) });

  const cases: GameweekCase[] = seasons.flatMap((season) =>
    buildGameweekCases(loaded, season),
  );

  const reports: BaselineReport[] = BASELINES.map((projector) => {
    const run = runBacktest(cases, projector);
    return {
      projector,
      run,
      pooled: summariseRun(run.gameweeks, BOOTSTRAP),
      bySeason: seasons.map((season) => ({
        season,
        summary: summariseRun(
          run.gameweeks.filter((gameweek) => gameweek.season === season),
          BOOTSTRAP,
        ),
      })),
    };
  });

  const context = { vaastavCommit: manifest.vaastavCommit, ...BOOTSTRAP };
  await mkdir(join(RESULTS_FILE, '..'), { recursive: true });
  await writeFileAtomically(RESULTS_FILE, formatMarkdown(reports, context));
  await writeFullOutput(reports, context);
  printTable(reports);
}

interface Manifest {
  vaastavCommit: string;
}

async function readManifest(): Promise<Manifest> {
  const path = join(DERIVED_DIR, 'manifest.json');
  if (!existsSync(path)) {
    throw new Error(`no dataset at ${DERIVED_DIR}. run npm run data:build first`);
  }
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('vaastavCommit' in parsed) ||
    typeof parsed.vaastavCommit !== 'string'
  ) {
    throw new Error(`${path} has no vaastavCommit; rebuild with npm run data:build`);
  }
  return { vaastavCommit: parsed.vaastavCommit };
}

async function readSeason(season: string): Promise<PlayerGameweekRow[]> {
  const path = join(DERIVED_DIR, `player-gameweeks-${season}.json`);
  if (!existsSync(path))
    throw new Error(`${path} is missing. run npm run data:build first`);
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${path} is not a list of rows; rebuild with npm run data:build`);
  }
  // data:build wrote these from rows that passed lib/dataset validation, so
  // they are trusted as that shape rather than validated a second time
  return parsed as PlayerGameweekRow[];
}

async function writeFullOutput(
  reports: readonly BaselineReport[],
  context: { vaastavCommit: string; resamples: number; seed: number },
): Promise<void> {
  await mkdir(EVAL_OUTPUT_DIR, { recursive: true });
  const summary = reports.map((report) => ({
    baseline: report.projector.id,
    unscoredGameweeks: report.run.unscoredGameweeks,
    pooled: report.pooled,
    bySeason: report.bySeason,
    gameweeks: report.run.gameweeks,
  }));
  await writeFileAtomically(
    join(EVAL_OUTPUT_DIR, 'baselines.json'),
    JSON.stringify({ ...context, splits: EVAL_SPLITS, baselines: summary }, null, 2),
  );

  const header = 'baseline,season,gameweek,player_id,projected,actual,minutes';
  const lines = reports.flatMap((report) =>
    report.run.projections.map((p) =>
      [
        report.projector.id,
        p.season,
        p.gameweek,
        p.playerId,
        p.projected,
        p.actual,
        p.minutes,
      ].join(','),
    ),
  );
  await writeFileAtomically(
    join(EVAL_OUTPUT_DIR, 'baselines-projections.csv'),
    `${header}\n${lines.join('\n')}\n`,
  );
}

function printTable(reports: readonly BaselineReport[]): void {
  console.log(
    `baselines on the tune seasons (${EVAL_SPLITS.tune.join(', ')}), 95% intervals:`,
  );
  console.table(
    Object.fromEntries(
      reports.map((report) => [
        report.projector.label,
        Object.fromEntries(
          METRICS.map((metric) => {
            const found = report.pooled.find((summary) => summary.id === metric.id);
            const interval = found?.interval;
            const range =
              interval == null
                ? ''
                : ` [${formatNumber(interval.low)}, ${formatNumber(interval.high)}]`;
            return [metric.label, `${formatNumber(found?.value ?? null)}${range}`];
          }),
        ),
      ]),
    ),
  );
  console.log('written: results/baselines.md and data/derived/eval/');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
