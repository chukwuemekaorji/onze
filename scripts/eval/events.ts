import { join } from 'node:path';
import { FULL_GAME_FEATURES } from '../../lib/analysis/event-projection.js';
import type { FullGameFeatures } from '../../lib/analysis/event-projection.js';
import {
  PROJECTION_FIT,
  PROJECTION_WEIGHTS,
} from '../../lib/analysis/projection-weights.js';
import { runBacktest } from '../../lib/eval/backtest.js';
import { BASELINES } from '../../lib/eval/baselines.js';
import {
  HAUL_METRICS,
  captainCounts,
  captainDisagreement,
  haulParts,
  haulSummary,
  haulValue,
  pairedDifference,
  pairedMetricDifference,
} from '../../lib/eval/compare.js';
import { calibrationByPosition } from '../../lib/eval/event-calibration.js';
import {
  FINISHING_STRENGTHS,
  bestFinishingStrength,
  eventProjector,
  eventTrainingSet,
  fitEvents,
  goalLogLoss,
  mergeTrainingSets,
} from '../../lib/eval/event-projector.js';
import type { EventTrainingSet } from '../../lib/eval/event-projector.js';
import { METRICS } from '../../lib/eval/metrics.js';
import {
  fitProjection,
  projectionProjector,
  trainingSet,
} from '../../lib/eval/projection-projector.js';
import type { TrainingSet } from '../../lib/eval/projection-projector.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { GameweekCase, SeasonRows } from '../../lib/eval/snapshot.js';
import { EVAL_SPLITS, assertTuneSeasons } from '../../lib/eval/splits.js';
import { writeFileAtomically } from '../data/http.js';
import { formatEventWeightsModule, formatEventsMarkdown } from './events-report.js';
import {
  BOOTSTRAP,
  RESULTS_DIR,
  failLoudly,
  mergeRuns,
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
  'event-weights.ts',
);
const TOP_CAPTAINS_SHOWN = 5;

// npm run eval:events: leave-one-season-out on the tune seasons, the event
// model next to step 3 (refitted the same way) and the baselines. 2025-26 is
// never loaded
async function main(): Promise<void> {
  const tune = [...EVAL_SPLITS.tune];
  assertTuneSeasons(tune);
  const context = { vaastavCommit: await readVaastavCommit(), ...BOOTSTRAP };
  const loaded = await readSeasons([...EVAL_SPLITS.prior, ...tune]);

  const cases = new Map<string, GameweekCase[]>();
  const rowsOf = new Map<string, SeasonRows['rows']>();
  const eventSets = new Map<string, EventTrainingSet>();
  const pointsSets = new Map<string, TrainingSet>();
  for (const season of tune) {
    const seasonCases = buildGameweekCases(loaded, season);
    const rows = loaded.find((entry) => entry.season === season)?.rows ?? [];
    cases.set(season, seasonCases);
    rowsOf.set(season, rows);
    eventSets.set(season, eventTrainingSet(seasonCases, rows));
    pointsSets.set(season, trainingSet(seasonCases, rows));
  }
  const pick = <T>(map: ReadonlyMap<string, T>, season: string): T => {
    const found = map.get(season);
    if (found === undefined) throw new Error(`nothing built for ${season}`);
    return found;
  };
  const otherSeason = (season: string) =>
    tune.find((other) => other !== season) ?? season;

  // each season is scored by numbers that never saw it
  const folds = tune.map((held) => {
    const train = pick(eventSets, otherSeason(held));
    return {
      trainedOn: otherSeason(held),
      scoredOn: held,
      weights: fitEvents(train, bestFinishingStrength(train)),
    };
  });
  const eventRun = mergeRuns(
    'events',
    folds.map((fold) =>
      runBacktest(pick(cases, fold.scoredOn), eventProjector(fold.weights, 'fold')),
    ),
  );
  // step 3 refitted per fold exactly as eval:projection does, so both rows are out of fold
  const step3Run = mergeRuns(
    'projection',
    tune.map((held) =>
      runBacktest(
        pick(cases, held),
        projectionProjector(
          fitProjection(
            pick(pointsSets, otherSeason(held)),
            PROJECTION_FIT.pointsPenalty,
          ),
          'fold',
        ),
      ),
    ),
  );
  const both = mergeTrainingSets(tune.map((season) => pick(eventSets, season)));
  const finalWeights = fitEvents(both, bestFinishingStrength(both));
  const allCases = tune.flatMap((season) => pick(cases, season));

  // the rows are scored out of fold; the projectors here only name them
  const reports = [
    reportFor(eventProjector(finalWeights, 'Event model'), eventRun, tune),
    reportFor(projectionProjector(PROJECTION_WEIGHTS, 'Step 3 model'), step3Run, tune),
    ...BASELINES.map((projector) =>
      reportFor(projector, runBacktest(allCases, projector), tune),
    ),
  ];

  const metricDifferences = METRICS.map(({ id }) => ({
    id,
    difference: pairedMetricDifference(
      eventRun.gameweeks,
      step3Run.gameweeks,
      id,
      BOOTSTRAP,
    ),
  }));
  const eventHauls = haulParts(eventRun.projections);
  const step3Hauls = haulParts(step3Run.projections);
  const haulDifferences = HAUL_METRICS.map(({ id }) => ({
    id,
    difference: pairedDifference(
      eventHauls,
      step3Hauls,
      (sample) => haulValue(id, sample),
      BOOTSTRAP,
    ),
  }));
  const haulRows = reports.map((report) => ({
    label: report.projector.label,
    summary: haulSummary(haulParts(report.run.projections), BOOTSTRAP),
  }));
  const calibration = calibrationByPosition(
    folds.map((fold) => ({
      cases: pick(cases, fold.scoredOn),
      seasonRows: pick(rowsOf, fold.scoredOn),
      weights: fold.weights,
    })),
  );
  const nameOf = new Map(
    loaded.flatMap(({ rows }) =>
      rows.map((row) => [`${row.season}/${row.playerId}`, row.playerName] as const),
    ),
  );
  // the same person in two seasons counts once, by name
  const topCaptains = (projections: typeof eventRun.projections) => {
    const byName = new Map<string, number>();
    for (const entry of captainCounts(projections)) {
      const name =
        nameOf.get(`${entry.season}/${entry.playerId}`) ?? `player ${entry.playerId}`;
      byName.set(name, (byName.get(name) ?? 0) + entry.gameweeks);
    }
    return [...byName]
      .map(([name, gameweeks]) => ({ name, gameweeks }))
      .sort((a, b) => b.gameweeks - a.gameweeks)
      .slice(0, TOP_CAPTAINS_SHOWN);
  };
  const captains = [
    { label: 'Event model', top: topCaptains(eventRun.projections) },
    { label: 'Step 3 model', top: topCaptains(step3Run.projections) },
  ];
  const disagreement = captainDisagreement(eventRun.projections, step3Run.projections);
  const finishingLosses = FINISHING_STRENGTHS.map((strength) => ({
    strength,
    losses: tune.map((season) =>
      goalLogLoss(pick(eventSets, season).appearances, strength),
    ),
  }));

  await writeFileAtomically(
    WEIGHTS_FILE,
    formatEventWeightsModule(finalWeights, {
      seasons: tune,
      vaastavCommit: context.vaastavCommit,
    }),
  );
  await writeFileAtomically(
    join(RESULTS_DIR, 'events.md'),
    formatEventsMarkdown({
      reports,
      context,
      metricDifferences,
      haulRows,
      haulDifferences,
      finalWeights,
      folds,
      finishingLosses,
      lossSeasons: tune,
      calibration,
      typicalFullGame: typicalFeatures(both),
      captains,
      disagreement,
    }),
  );
  await writeFullOutput('events', reports, context, {
    folds,
    finalWeights,
    metricDifferences,
    haulDifferences,
    calibration,
  });
  console.log('event model and step 3 (both out of fold), baselines, 95% intervals:');
  printTable(reports);
  console.log(
    'written: results/events.md, lib/analysis/event-weights.ts, data/derived/eval/',
  );
}

/** the average 60+ minutes features, the "typical player" the report talks about */
function typicalFeatures(set: EventTrainingSet): FullGameFeatures {
  return Object.fromEntries(
    FULL_GAME_FEATURES.map((key) => [
      key,
      set.fullGame.reduce((sum, example) => sum + example.features[key], 0) /
        set.fullGame.length,
    ]),
  ) as FullGameFeatures;
}

main().catch(failLoudly);
