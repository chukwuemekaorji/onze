import { join } from 'node:path';
import { runBacktest } from '../../lib/eval/backtest.js';
import type { BacktestRun } from '../../lib/eval/backtest.js';
import { BASELINES } from '../../lib/eval/baselines.js';
import {
  fitProjection,
  pointsIfPlayingError,
  projectionProjector,
  trainingSet,
} from '../../lib/eval/projection-projector.js';
import type { TrainingSet } from '../../lib/eval/projection-projector.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { GameweekCase } from '../../lib/eval/snapshot.js';
import { EVAL_SPLITS, assertTuneSeasons } from '../../lib/eval/splits.js';
import { writeFileAtomically } from '../data/http.js';
import { formatProjectionMarkdown, formatWeightsModule } from './projection-report.js';
import type { FoldWeights } from './projection-report.js';
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

const WEIGHTS_FILE = join(
  import.meta.dirname,
  '..',
  '..',
  'lib',
  'analysis',
  'projection-weights.ts',
);
// ridge penalties tried for points if playing, chosen by cross-validation
const POINTS_PENALTIES = [0, 10, 100, 1_000, 10_000];

// npm run eval:projection: leave-one-season-out on the tune seasons, then one
// final fit on both. 2025-26 is never loaded
async function main(): Promise<void> {
  const tune = [...EVAL_SPLITS.tune];
  assertTuneSeasons(tune);
  const context = { vaastavCommit: await readVaastavCommit(), ...BOOTSTRAP };
  const loaded = await readSeasons([...EVAL_SPLITS.prior, ...tune]);

  const cases = new Map<string, GameweekCase[]>();
  const training = new Map<string, TrainingSet>();
  for (const season of tune) {
    const seasonCases = buildGameweekCases(loaded, season);
    const rows = loaded.find((entry) => entry.season === season)?.rows ?? [];
    cases.set(season, seasonCases);
    training.set(season, trainingSet(seasonCases, rows));
  }
  const casesOf = (season: string) => cases.get(season) ?? [];
  const trainingOf = (season: string): TrainingSet =>
    training.get(season) ?? { play: [], points: [] };
  const otherSeason = (season: string) =>
    tune.find((other) => other !== season) ?? season;

  const penaltyErrors = POINTS_PENALTIES.map((penalty) => ({
    penalty,
    error:
      tune
        .map((held) =>
          pointsIfPlayingError(
            fitProjection(trainingOf(otherSeason(held)), penalty),
            trainingOf(held).points,
          ),
        )
        .reduce((a, b) => a + b, 0) / tune.length,
  }));
  const best = penaltyErrors.reduce((a, b) => (b.error < a.error ? b : a));
  console.log(`points penalty ${best.penalty} (cv rmse ${best.error.toFixed(3)})`);

  // each season is scored by weights that never saw it
  const folds: FoldWeights[] = tune.map((held) => ({
    trainedOn: otherSeason(held),
    scoredOn: held,
    weights: fitProjection(trainingOf(otherSeason(held)), best.penalty),
  }));
  const outOfFold = mergeRuns(
    folds.map((fold) =>
      runBacktest(casesOf(fold.scoredOn), projectionProjector(fold.weights, 'fold')),
    ),
  );
  const both: TrainingSet = {
    play: tune.flatMap((season) => trainingOf(season).play),
    points: tune.flatMap((season) => trainingOf(season).points),
  };
  const finalWeights = fitProjection(both, best.penalty);
  const allCases = tune.flatMap(casesOf);
  // the row is scored out of fold; the projector here only names it
  const modelReport = reportFor(
    projectionProjector(finalWeights, 'Projection model'),
    outOfFold,
    tune,
  );
  const reports = [
    modelReport,
    ...BASELINES.map((projector) =>
      reportFor(projector, runBacktest(allCases, projector), tune),
    ),
  ];

  const linkage = tune.map((season) => linkageOf(season, casesOf(season)));

  await writeFileAtomically(
    WEIGHTS_FILE,
    formatWeightsModule(finalWeights, {
      seasons: tune,
      pointsPenalty: best.penalty,
      vaastavCommit: context.vaastavCommit,
    }),
  );
  await writeFileAtomically(
    join(RESULTS_DIR, 'projection.md'),
    formatProjectionMarkdown({
      reports,
      context,
      folds,
      finalWeights,
      training: both,
      penaltyErrors,
      chosenPenalty: best.penalty,
      linkage,
    }),
  );
  await writeFullOutput('projection', reports, context, {
    pointsPenalty: best.penalty,
    penaltyErrors,
    folds,
    finalWeights,
  });
  console.log(
    'projection model (out of fold) and baselines, tune seasons, 95% intervals:',
  );
  printTable(reports);
  console.log(
    'written: results/projection.md, lib/analysis/projection-weights.ts, data/derived/eval/',
  );
}

/** the folds in tune-season order, so gameweeks line up with the baselines' runs */
function mergeRuns(runs: readonly BacktestRun[]): BacktestRun {
  return {
    projectorId: 'projection',
    gameweeks: runs.flatMap((run) => run.gameweeks),
    unscoredGameweeks: runs.reduce((sum, run) => sum + run.unscoredGameweeks, 0),
    projections: runs.flatMap((run) => run.projections),
  };
}

/** how many players who played could be found in last season by stable code */
function linkageOf(season: string, seasonCases: readonly GameweekCase[]) {
  let played = 0;
  let linked = 0;
  for (const { history, targets, outcomes } of seasonCases) {
    for (const target of targets) {
      if ((outcomes.get(target.playerId)?.minutes ?? 0) === 0) continue;
      played += 1;
      if (history.lastSeasonRows(target.playerCode).length > 0) linked += 1;
    }
  }
  return { season, played, linked };
}

main().catch(failLoudly);
