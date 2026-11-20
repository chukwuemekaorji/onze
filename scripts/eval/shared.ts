import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlayerGameweekRow } from '../../lib/dataset/player-gameweek.js';
import { summariseRun } from '../../lib/eval/backtest.js';
import type { BacktestRun } from '../../lib/eval/backtest.js';
import type { Projector } from '../../lib/eval/baselines.js';
import { METRICS } from '../../lib/eval/metrics.js';
import type { SeasonRows } from '../../lib/eval/snapshot.js';
import { DERIVED_DIR } from '../data/config.js';
import { writeFileAtomically } from '../data/http.js';
import { formatNumber } from './report.js';
import type { BaselineReport, ReportContext } from './report.js';

export const RESULTS_DIR = join(import.meta.dirname, '..', '..', 'results');
export const EVAL_OUTPUT_DIR = join(DERIVED_DIR, 'eval');
export const BOOTSTRAP = { resamples: 2_000, seed: 2026, level: 0.95 };

export async function readVaastavCommit(): Promise<string> {
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
  return parsed.vaastavCommit;
}

export async function readSeasons(seasons: readonly string[]): Promise<SeasonRows[]> {
  const loaded: SeasonRows[] = [];
  for (const season of seasons) loaded.push({ season, rows: await readSeason(season) });
  return loaded;
}

async function readSeason(season: string): Promise<PlayerGameweekRow[]> {
  const path = join(DERIVED_DIR, `player-gameweeks-${season}.json`);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing. run npm run data:build first`);
  }
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${path} is not a list of rows; rebuild with npm run data:build`);
  }
  // data:build wrote these from rows that passed lib/dataset validation, so
  // they are trusted as that shape rather than validated a second time
  return parsed as PlayerGameweekRow[];
}

/** a scored run with its pooled and per-season summaries */
export function reportFor(
  projector: Projector,
  run: BacktestRun,
  seasons: readonly string[],
): BaselineReport {
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
}

/** everything behind the committed markdown: per-gameweek parts and every projection */
export async function writeFullOutput(
  name: string,
  reports: readonly BaselineReport[],
  context: ReportContext,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const summary = reports.map((report) => ({
    projector: report.projector.id,
    unscoredGameweeks: report.run.unscoredGameweeks,
    pooled: report.pooled,
    bySeason: report.bySeason,
    gameweeks: report.run.gameweeks,
  }));
  await writeFileAtomically(
    join(EVAL_OUTPUT_DIR, `${name}.json`),
    JSON.stringify({ ...context, ...extra, projectors: summary }, null, 2),
  );
  const header = 'projector,season,gameweek,player_id,projected,actual,minutes';
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
    join(EVAL_OUTPUT_DIR, `${name}-projections.csv`),
    `${header}\n${lines.join('\n')}\n`,
  );
}

/** fold runs in tune-season order, so gameweeks line up with the baselines' runs */
export function mergeRuns(
  projectorId: string,
  runs: readonly BacktestRun[],
): BacktestRun {
  return {
    projectorId,
    gameweeks: runs.flatMap((run) => run.gameweeks),
    unscoredGameweeks: runs.reduce((sum, run) => sum + run.unscoredGameweeks, 0),
    projections: runs.flatMap((run) => run.projections),
  };
}

export function printTable(reports: readonly BaselineReport[]): void {
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
}

export function failLoudly(error: unknown): void {
  // a half-written result must not look finished
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
