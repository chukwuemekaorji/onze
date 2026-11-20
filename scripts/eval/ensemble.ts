import { join } from 'node:path';
import { PROJECTION_FIT } from '../../lib/analysis/projection-weights.js';
import type { Position } from '../../lib/analysis/types.js';
import { runBacktest, summariseRun } from '../../lib/eval/backtest.js';
import type { BacktestRun } from '../../lib/eval/backtest.js';
import type { Projector } from '../../lib/eval/baselines.js';
import { haulParts, haulSummary } from '../../lib/eval/compare.js';
import {
  bestBlendWeight,
  bestBlendWeightsByPosition,
  blendExamples,
  blendProjector,
  decide,
  decisionDifferences,
  memoised,
  routeGameweeks,
  routeHauls,
} from '../../lib/eval/ensemble.js';
import type { ScoredRun } from '../../lib/eval/ensemble.js';
import {
  bestFinishingStrength,
  eventProjector,
  eventTrainingSet,
  fitEvents,
} from '../../lib/eval/event-projector.js';
import {
  fitProjection,
  projectionProjector,
  trainingSet,
} from '../../lib/eval/projection-projector.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { GameweekCase } from '../../lib/eval/snapshot.js';
import { EVAL_SPLITS, assertTuneSeasons } from '../../lib/eval/splits.js';
import { writeFileAtomically } from '../data/http.js';
import { formatEnsembleMarkdown } from './ensemble-report.js';
import type { CandidateRow } from './ensemble-report.js';
import {
  BOOTSTRAP,
  RESULTS_DIR,
  failLoudly,
  mergeRuns,
  readSeasons,
  readVaastavCommit,
  reportFor,
  writeFullOutput,
} from './shared.js';

const LABELS = {
  twoPart: 'Two-part model (step 3)',
  event: 'Event model (step 4)',
  blend: 'Blend, one w',
  blendByPosition: 'Blend, w per position',
  routing: 'Routing: event shortlist, two-part captain',
} as const;

// npm run eval:ensemble: leave-one-season-out on the tune seasons. in each
// fold both models and the blend weights are fitted on the training season
// only, then the held season is scored. 2025-26 is never loaded
async function main(): Promise<void> {
  const tune = [...EVAL_SPLITS.tune];
  assertTuneSeasons(tune);
  const context = { vaastavCommit: await readVaastavCommit(), ...BOOTSTRAP };
  const loaded = await readSeasons([...EVAL_SPLITS.prior, ...tune]);

  const cases = new Map<string, GameweekCase[]>();
  for (const season of tune) cases.set(season, buildGameweekCases(loaded, season));
  const pick = (season: string): GameweekCase[] => {
    const found = cases.get(season);
    if (found === undefined) throw new Error(`no cases built for ${season}`);
    return found;
  };
  const rowsOf = (season: string) =>
    loaded.find((entry) => entry.season === season)?.rows ?? [];
  const otherSeason = (season: string) =>
    tune.find((other) => other !== season) ?? season;

  const folds = tune.map((held) => {
    const trainedOn = otherSeason(held);
    const trainCases = pick(trainedOn);
    const eventSet = eventTrainingSet(trainCases, rowsOf(trainedOn));
    const twoPart = memoised(
      projectionProjector(
        fitProjection(
          trainingSet(trainCases, rowsOf(trainedOn)),
          PROJECTION_FIT.pointsPenalty,
        ),
        LABELS.twoPart,
      ),
    );
    const event = memoised(
      eventProjector(
        fitEvents(eventSet, bestFinishingStrength(eventSet)),
        LABELS.event,
      ),
    );
    // chosen on the training season, so the held season's results never reach w
    const examples = blendExamples(trainCases, twoPart, event);
    const weight = bestBlendWeight(examples);
    const byPosition = bestBlendWeightsByPosition(examples);
    const scored = pick(held);
    return {
      trainedOn,
      scoredOn: held,
      weight,
      byPosition,
      runs: {
        twoPart: runBacktest(scored, twoPart),
        event: runBacktest(scored, event),
        blend: runBacktest(
          scored,
          blendProjector(twoPart, event, () => weight, 'fold'),
        ),
        blendByPosition: runBacktest(
          scored,
          blendProjector(
            twoPart,
            event,
            (position: Position) => byPosition[position],
            'fold',
          ),
        ),
      },
    };
  });

  const merged = (key: keyof (typeof folds)[number]['runs']): BacktestRun =>
    mergeRuns(
      key,
      folds.map((fold) => fold.runs[key]),
    );
  const runs = {
    twoPart: merged('twoPart'),
    event: merged('event'),
    blend: merged('blend'),
    blendByPosition: merged('blendByPosition'),
  };
  const scoredOf = (run: BacktestRun): ScoredRun => ({
    gameweeks: run.gameweeks,
    hauls: haulParts(run.projections),
  });
  const scored = {
    twoPart: scoredOf(runs.twoPart),
    event: scoredOf(runs.event),
    blend: scoredOf(runs.blend),
    blendByPosition: scoredOf(runs.blendByPosition),
  };
  const routing: ScoredRun = {
    gameweeks: routeGameweeks(runs.event.gameweeks, runs.twoPart.gameweeks),
    hauls: routeHauls(scored.event.hauls, scored.twoPart.hauls),
  };

  // the per-position weights must earn their place against the single w first
  const byPositionDifferences = decisionDifferences(
    scored.blendByPosition,
    scored.blend,
    BOOTSTRAP,
  );
  const byPositionDecision = decide(byPositionDifferences);
  const keptBlend = byPositionDecision.ship ? 'blendByPosition' : 'blend';

  const row = (
    id: CandidateRow['id'],
    label: string,
    run: ScoredRun,
    candidate: boolean,
  ): CandidateRow => {
    const differences = decisionDifferences(run, scored.twoPart, BOOTSTRAP);
    return {
      id,
      label,
      candidate,
      metrics: summariseRun(run.gameweeks, BOOTSTRAP),
      hauls: haulSummary(run.hauls, BOOTSTRAP),
      differences,
      decision: decide(differences),
    };
  };
  const rows: CandidateRow[] = [
    row('twoPart', LABELS.twoPart, scored.twoPart, false),
    row('event', LABELS.event, scored.event, false),
    row('blend', LABELS.blend, scored.blend, keptBlend === 'blend'),
    row(
      'blendByPosition',
      LABELS.blendByPosition,
      scored.blendByPosition,
      keptBlend === 'blendByPosition',
    ),
    row('routing', LABELS.routing, routing, true),
  ];

  const reports = [
    reportFor(projectorNamed(LABELS.twoPart), runs.twoPart, tune),
    reportFor(projectorNamed(LABELS.event), runs.event, tune),
    reportFor(projectorNamed(LABELS.blend), runs.blend, tune),
    reportFor(projectorNamed(LABELS.blendByPosition), runs.blendByPosition, tune),
  ];
  const foldWeights = folds.map(({ trainedOn, scoredOn, weight, byPosition }) => ({
    trainedOn,
    scoredOn,
    weight,
    byPosition,
  }));

  await writeFileAtomically(
    join(RESULTS_DIR, 'ensemble.md'),
    formatEnsembleMarkdown({
      context,
      reports,
      rows,
      foldWeights,
      byPositionDifferences,
      byPositionDecision,
      routingLabel: LABELS.routing,
      blendLabels: { single: LABELS.blend, byPosition: LABELS.blendByPosition },
    }),
  );
  await writeFullOutput('ensemble', reports, context, {
    foldWeights,
    byPositionDecision,
    decisions: rows.map(({ id, differences, decision }) => ({
      id,
      differences,
      decision,
    })),
  });
  console.table(
    Object.fromEntries(
      rows.map((entry) => [
        entry.label,
        {
          topFive: entry.decision.readings.topFive,
          hauls: entry.decision.readings.haulsShortlisted,
          regret: entry.decision.readings.captainRegret,
          ship: entry.candidate ? entry.decision.ship : '',
        },
      ]),
    ),
  );
  console.log('written: results/ensemble.md, data/derived/eval/');
}

/** the rows are scored out of fold; these only name them in the tables */
function projectorNamed(label: string): Projector {
  return {
    id: label,
    label,
    describe: label,
    project: () => null,
  };
}

main().catch(failLoudly);
