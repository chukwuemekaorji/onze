import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EVENT_WEIGHTS } from '../../lib/analysis/event-weights.js';
import { scoresDefensiveContributions } from '../../lib/analysis/fpl-scoring.js';
import { PROJECTION_WEIGHTS } from '../../lib/analysis/projection-weights.js';
import type { Position } from '../../lib/analysis/types.js';
import { runBacktest, summariseRun } from '../../lib/eval/backtest.js';
import type { BacktestRun } from '../../lib/eval/backtest.js';
import { BASELINES } from '../../lib/eval/baselines.js';
import type { Projector } from '../../lib/eval/baselines.js';
import { haulParts, haulSummary } from '../../lib/eval/compare.js';
import {
  defensiveContributionCalls,
  summariseCalls,
} from '../../lib/eval/defensive-contribution-check.js';
import {
  bestBlendWeight,
  blendExamples,
  blendProjector,
  decideNotWorse,
  decisionDifferences,
  memoised,
} from '../../lib/eval/ensemble.js';
import type { ScoredRun } from '../../lib/eval/ensemble.js';
import { eventProjector } from '../../lib/eval/event-projector.js';
import { projectionProjector } from '../../lib/eval/projection-projector.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import {
  EVAL_SPLITS,
  assertTestSeason,
  assertTuneSeasons,
} from '../../lib/eval/splits.js';
import { writeFileAtomically } from '../data/http.js';
import {
  BOOTSTRAP,
  EVAL_OUTPUT_DIR,
  RESULTS_DIR,
  failLoudly,
  readSeasons,
  readVaastavCommit,
  reportFor,
  writeFullOutput,
} from './shared.js';
import {
  assertRegistered,
  formatTestMarkdown,
  registration,
} from './test-season-report.js';
import type { ScoredModel } from './test-season-report.js';

const RESULTS_FILE = join(RESULTS_DIR, 'test-2025-26.md');
// a dry run of the scoring code on a tune season already seen, so a bug can't
// cost the one real run. its output is scratch and never committed
const REHEARSAL_FILE = join(EVAL_OUTPUT_DIR, 'test-rehearsal.md');
const REHEARSAL_SEASON = EVAL_SPLITS.tune[1];
const SCORED_POSITIONS: readonly Position[] = ['DEF', 'MID', 'FWD'];

type Mode = 'register' | 'score' | 'rehearse';

// npm run eval:test:register writes the rule and w, from the tune seasons only.
// npm run eval:test scores the test season once against that registration
async function main(mode: Mode): Promise<void> {
  const context = { vaastavCommit: await readVaastavCommit(), ...BOOTSTRAP };
  const twoPart = memoised(
    projectionProjector(PROJECTION_WEIGHTS, 'Two-part model (step 3)'),
  );
  const event = memoised(eventProjector(EVENT_WEIGHTS, 'Event model (step 4)'));
  const { weight, text, hash } = await register(context, twoPart, event);

  if (mode === 'register') {
    if (existsSync(RESULTS_FILE)) {
      throw new Error(`${RESULTS_FILE} exists; a registration is written once`);
    }
    await writeFileAtomically(RESULTS_FILE, text);
    console.log(
      `registered: w = ${weight.toFixed(4)}, written to results/test-2025-26.md`,
    );
    return;
  }

  const season = mode === 'score' ? EVAL_SPLITS.test[0] : REHEARSAL_SEASON;
  if (mode === 'score') {
    assertTestSeason(season);
    const file = existsSync(RESULTS_FILE) ? await readFile(RESULTS_FILE, 'utf8') : null;
    assertRegistered(file, hash);
  }
  const loaded = await readSeasons(seasonsFor(season));
  const cases = buildGameweekCases(loaded, season);
  const seasonRows = loaded.find((entry) => entry.season === season)?.rows ?? [];

  const blend = blendProjector(
    twoPart,
    event,
    () => weight,
    `Blend, w = ${weight.toFixed(2)}`,
  );
  const runs = {
    twoPart: runBacktest(cases, twoPart),
    event: runBacktest(cases, event),
    blend: runBacktest(cases, blend),
  };
  const scored = (run: BacktestRun): ScoredRun => ({
    gameweeks: run.gameweeks,
    hauls: haulParts(run.projections),
  });
  const model = (label: string, run: BacktestRun): ScoredModel => ({
    label,
    metrics: summariseRun(run.gameweeks, BOOTSTRAP),
    hauls: haulSummary(haulParts(run.projections), BOOTSTRAP),
  });
  const blendDifferences = decisionDifferences(
    scored(runs.blend),
    scored(runs.twoPart),
    BOOTSTRAP,
  );
  const eventDifferences = decisionDifferences(
    scored(runs.event),
    scored(runs.twoPart),
    BOOTSTRAP,
  );

  const seasons = [season];
  const reports = [
    reportFor(twoPart, runs.twoPart, seasons),
    reportFor(event, runs.event, seasons),
    reportFor(blend, runs.blend, seasons),
    ...BASELINES.map((projector) =>
      reportFor(projector, runBacktest(cases, projector), seasons),
    ),
  ];
  // only seasons that score the rule have counts to check it against
  const calls = scoresDefensiveContributions(season)
    ? defensiveContributionCalls(cases, seasonRows)
    : null;
  const markdown = formatTestMarkdown({
    context,
    season,
    registered: text,
    blend: model(blend.label, runs.blend),
    twoPart: model(twoPart.label, runs.twoPart),
    blendDifferences,
    decision: decideNotWorse(blendDifferences),
    eventDifferences,
    eventDecision: decideNotWorse(eventDifferences),
    eventLabel: event.label,
    reports,
    haulRows: reports.map((report) => model(report.projector.label, report.run)),
    defensive:
      calls === null
        ? null
        : {
            all: summariseCalls(calls),
            byPosition: SCORED_POSITIONS.map((position) => ({
              position,
              summary: summariseCalls(
                calls.filter((call) => call.position === position),
              ),
            })),
          },
  });

  if (mode === 'rehearse') {
    await writeFileAtomically(REHEARSAL_FILE, markdown);
    console.log(`rehearsal on ${season} written to ${REHEARSAL_FILE}`);
    return;
  }
  await writeFileAtomically(RESULTS_FILE, markdown);
  await writeFullOutput('test-2025-26', reports, context, {
    weight,
    blendDifferences,
    eventDifferences,
  });
  console.log('scored once: results/test-2025-26.md, data/derived/eval/');
}

/** w from the tune seasons only, and the registration text that fixes it */
async function register(
  context: { vaastavCommit: string; resamples: number; seed: number },
  twoPart: Projector,
  event: Projector,
): Promise<{ weight: number; text: string; hash: string }> {
  const tune = [...EVAL_SPLITS.tune];
  assertTuneSeasons(tune);
  const loaded = await readSeasons([...EVAL_SPLITS.prior, ...tune]);
  const examples = tune.flatMap((season) =>
    blendExamples(buildGameweekCases(loaded, season), twoPart, event),
  );
  const weight = bestBlendWeight(examples);
  return {
    weight,
    ...registration({
      context,
      weight,
      tuneSeasons: tune,
      tunePlayerGameweeks: examples.length,
    }),
  };
}

/** the scored season and the one before it, which its priors are read from */
function seasonsFor(season: string): string[] {
  const order: readonly string[] = [
    ...EVAL_SPLITS.prior,
    ...EVAL_SPLITS.tune,
    ...EVAL_SPLITS.test,
  ];
  const index = order.indexOf(season);
  const before = order[index - 1];
  if (index < 1 || before === undefined) throw new Error(`no season before ${season}`);
  return [before, season];
}

function modeFrom(argument: string | undefined): Mode {
  if (argument === 'register' || argument === 'score' || argument === 'rehearse') {
    return argument;
  }
  throw new Error(`expected register, score or rehearse, got ${argument ?? 'nothing'}`);
}

main(modeFrom(process.argv[2])).catch(failLoudly);
