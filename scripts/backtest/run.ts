import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TWO_PART_SHARE } from '../../lib/analysis/blend-weight.js';
import { EVENT_WEIGHTS } from '../../lib/analysis/event-weights.js';
import {
  PROJECTION_FIT,
  PROJECTION_WEIGHTS,
} from '../../lib/analysis/projection-weights.js';
import type { AnalysisPlayer } from '../../lib/analysis/types.js';
import { pairedDifference } from '../../lib/backtest/compare.js';
import { POLICIES } from '../../lib/backtest/policies.js';
import type { PolicyId } from '../../lib/backtest/policies.js';
import {
  buildSeasonData,
  clubAt,
  isInGame,
  priceAt,
} from '../../lib/backtest/season-data.js';
import type { SeasonData } from '../../lib/backtest/season-data.js';
import { simulateSeason } from '../../lib/backtest/simulate.js';
import type { SeasonRun } from '../../lib/backtest/simulate.js';
import { buildStartSquads } from '../../lib/backtest/start-squads.js';
import type { StartSquad } from '../../lib/backtest/start-squads.js';
import { analysisPlayer, predictDeadline } from '../../lib/backtest/views.js';
import type { PlayerPrediction, ViewKind } from '../../lib/backtest/views.js';
import type { ModelWeights } from '../../lib/build-projections.js';
import { bestBlendWeight, blendExamples } from '../../lib/eval/ensemble.js';
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
import type { SeasonRows } from '../../lib/eval/snapshot.js';
import {
  EVAL_SPLITS,
  assertTestSeason,
  assertTuneSeasons,
} from '../../lib/eval/splits.js';
import { DERIVED_DIR } from '../data/config.js';
import { writeFileAtomically } from '../data/http.js';
import { BOOTSTRAP, RESULTS_DIR, failLoudly, readSeasons } from '../eval/shared.js';
import { assertRegistered, formatResults, registration } from './report.js';

const RESULTS_FILE = join(RESULTS_DIR, 'decision-backtest.md');
const OUTPUT_DIR = join(DERIVED_DIR, 'backtest');
// a dry run of the code on one tune season, so a bug can't cost the one real run
const REHEARSAL_FILE = join(OUTPUT_DIR, 'rehearsal.md');
const REHEARSAL_SQUADS = 3;
const START_SQUADS = 20;
// one seed per season, from the year it starts
const SQUAD_SEED_BASE = 2026;
// fixed before the run: the examples are a variant squad in a tune season and
// the best guess in the season the models never saw
const EXAMPLES = [
  { season: '2024-25', squadNumber: 3 },
  { season: '2025-26', squadNumber: 1 },
];
const LABELS: Record<PolicyId, string> = {
  'no-transfers': 'No transfers',
  'form-greedy': 'Form greedy',
  'onze-one-week': 'Onze one-week',
  'onze-planner': 'Onze planner',
};

type Mode = 'register' | 'rehearse' | 'run';

interface SeasonPlan {
  season: string;
  weights: 'out-of-fold' | 'frozen';
}

const PLANS: readonly SeasonPlan[] = [
  ...EVAL_SPLITS.tune.map((season) => ({ season, weights: 'out-of-fold' as const })),
  ...EVAL_SPLITS.test.map((season) => ({ season, weights: 'frozen' as const })),
];

function describeWeights(plan: SeasonPlan): string {
  if (plan.weights === 'frozen') {
    return `run once with the frozen weights (both models and the blend share ${TWO_PART_SHARE}), the app's own; nothing is tuned on it`;
  }
  const other = EVAL_SPLITS.tune.find((season) => season !== plan.season) ?? '';
  return `out of fold: both models and the blend share fitted on ${other} only, as in results/ensemble.md`;
}

// npm run backtest:register, then npm run backtest (once). npm run
// backtest:rehearse checks the code on one tune season without the rule
async function main(mode: Mode): Promise<void> {
  const { text, hash } = registration({
    squads: START_SQUADS,
    seasons: PLANS.map((plan) => ({
      season: plan.season,
      weights: describeWeights(plan),
    })),
    resamples: BOOTSTRAP.resamples,
    seed: BOOTSTRAP.seed,
  });
  if (mode === 'register') {
    if (existsSync(RESULTS_FILE))
      throw new Error(`${RESULTS_FILE} exists; a registration is written once`);
    await writeFileAtomically(RESULTS_FILE, text);
    console.log('registered: results/decision-backtest.md');
    return;
  }
  if (mode === 'run') {
    const file = existsSync(RESULTS_FILE) ? await readFile(RESULTS_FILE, 'utf8') : null;
    assertRegistered(file, hash);
  }

  const started = Date.now();
  const plans = mode === 'rehearse' ? PLANS.slice(0, 1) : PLANS;
  const squadCount = mode === 'rehearse' ? REHEARSAL_SQUADS : START_SQUADS;
  // the rehearsal never loads the locked season, let alone plays it
  const loaded = await readSeasons([
    ...EVAL_SPLITS.prior,
    ...EVAL_SPLITS.tune,
    ...(mode === 'run' ? EVAL_SPLITS.test : []),
  ]);
  const runs: Record<PolicyId, SeasonRun[]> = {
    'no-transfers': [],
    'form-greedy': [],
    'onze-one-week': [],
    'onze-planner': [],
  };
  for (const plan of plans) {
    if (plan.weights === 'frozen') assertTestSeason(plan.season);
    else assertTuneSeasons([plan.season]);
    const seasonStart = Date.now();
    const weights =
      plan.weights === 'frozen' ? frozenWeights() : foldWeights(loaded, plan.season);
    const rows = loaded.find((entry) => entry.season === plan.season)?.rows ?? [];
    const data = buildSeasonData(plan.season, rows);
    const viewAt = deadlineViews(data, loaded, weights);
    const squads = startSquads(data, loaded, squadCount);
    console.log(
      `${plan.season}: blend share ${weights.twoPartShare.toFixed(4)}, ${squads.length} start squads`,
    );
    for (const policy of POLICIES) {
      squads.forEach((squad, index) => {
        runs[policy.id].push(simulateSeason(data, squad, index + 1, policy, viewAt));
      });
      const totals = runs[policy.id]
        .filter((run) => run.season === plan.season)
        .map((run) => run.total);
      console.log(
        `  ${policy.label}: average ${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1)}`,
      );
    }
    console.log(`  ${((Date.now() - seasonStart) / 1000).toFixed(0)} s`);
  }

  const versus = (a: PolicyId, b: PolicyId) => ({
    a,
    b,
    difference: pairedDifference(runs[a], runs[b], BOOTSTRAP),
  });
  const markdown = formatResults({
    registered: text,
    labels: LABELS,
    runs,
    headline: pairedDifference(runs['onze-planner'], runs['onze-one-week'], BOOTSTRAP),
    comparisons: [
      versus('onze-planner', 'no-transfers'),
      versus('onze-one-week', 'no-transfers'),
      versus('onze-planner', 'form-greedy'),
      versus('onze-one-week', 'form-greedy'),
    ],
    examples:
      mode === 'rehearse'
        ? [{ season: plans[0]?.season ?? '', squadNumber: 1 }]
        : EXAMPLES,
    minutes: (Date.now() - started) / 60_000,
  });
  if (mode === 'rehearse') {
    await writeFileAtomically(REHEARSAL_FILE, markdown);
    console.log(`rehearsal written to ${REHEARSAL_FILE}`);
    return;
  }
  await writeFileAtomically(RESULTS_FILE, markdown);
  await writeFileAtomically(
    join(OUTPUT_DIR, 'decision-backtest.json'),
    JSON.stringify(runs),
  );
  console.log('run once: results/decision-backtest.md, data/derived/backtest/');
}

function frozenWeights(): ModelWeights {
  return {
    twoPart: PROJECTION_WEIGHTS,
    event: EVENT_WEIGHTS,
    twoPartShare: TWO_PART_SHARE,
  };
}

/** both models and the blend share fitted on the other tune season, as eval:ensemble does */
function foldWeights(loaded: readonly SeasonRows[], held: string): ModelWeights {
  const trainedOn = EVAL_SPLITS.tune.find((season) => season !== held);
  if (trainedOn === undefined) throw new Error(`no other tune season than ${held}`);
  const cases = buildGameweekCases(loaded, trainedOn);
  const rows = loaded.find((entry) => entry.season === trainedOn)?.rows ?? [];
  const twoPart = fitProjection(trainingSet(cases, rows), PROJECTION_FIT.pointsPenalty);
  const eventSet = eventTrainingSet(cases, rows);
  const event = fitEvents(eventSet, bestFinishingStrength(eventSet));
  const twoPartShare = bestBlendWeight(
    blendExamples(
      cases,
      projectionProjector(twoPart, 'fold'),
      eventProjector(event, 'fold'),
    ),
  );
  return { twoPart, event, twoPartShare };
}

/** each deadline's two views, worked out once and shared by every policy and squad */
function deadlineViews(
  data: SeasonData,
  loaded: readonly SeasonRows[],
  weights: ModelWeights,
): (gameweek: number, kind: ViewKind) => ReadonlyMap<number, AnalysisPlayer> {
  const cases = new Map(
    buildGameweekCases(loaded, data.season).map((entry) => [
      entry.history.gameweek,
      entry,
    ]),
  );
  const predictions = new Map<number, Map<number, PlayerPrediction>>();
  const views = new Map<string, Map<number, AnalysisPlayer>>();
  return (gameweek, kind) => {
    const key = `${gameweek}/${kind}`;
    const cached = views.get(key);
    if (cached !== undefined) return cached;
    let atDeadline = predictions.get(gameweek);
    if (atDeadline === undefined) {
      const history = cases.get(gameweek)?.history;
      if (history === undefined) throw new Error(`no history for gameweek ${gameweek}`);
      atDeadline = predictDeadline(data, gameweek, history, weights);
      predictions.set(gameweek, atDeadline);
    }
    const view = new Map<number, AnalysisPlayer>();
    for (const [id, prediction] of atDeadline) {
      const player = data.players.get(id);
      if (player !== undefined)
        view.set(id, analysisPlayer(player, prediction, data, gameweek, kind));
    }
    views.set(key, view);
    return view;
  };
}

/** gameweek 1 prices and clubs, last season's points by stable code */
function startSquads(
  data: SeasonData,
  loaded: readonly SeasonRows[],
  count: number,
): StartSquad[] {
  const [first] = data.gameweeks;
  if (first === undefined) throw new Error(`${data.season} has no gameweeks`);
  const lastSeason = loaded.filter((entry) => entry.season < data.season).at(-1);
  if (lastSeason === undefined) throw new Error(`no season before ${data.season}`);
  const lastPoints = new Map<number, number>();
  for (const row of lastSeason.rows) {
    lastPoints.set(
      row.playerCode,
      (lastPoints.get(row.playerCode) ?? 0) + row.totalPoints,
    );
  }
  const candidates = [...data.players.values()]
    .filter((player) => isInGame(player, first))
    .map((player) => ({
      id: player.id,
      position: player.position,
      teamId: clubAt(player, first).teamId,
      price: priceAt(player, first),
      lastSeasonPoints: lastPoints.get(player.code) ?? 0,
    }));
  const seed = SQUAD_SEED_BASE + Number.parseInt(data.season.slice(0, 4), 10);
  return buildStartSquads(candidates, count, seed);
}

function modeFrom(argument: string | undefined): Mode {
  if (argument === 'register' || argument === 'rehearse' || argument === 'run')
    return argument;
  throw new Error(`expected register, rehearse or run, got ${argument ?? 'nothing'}`);
}

main(modeFrom(process.argv[2])).catch(failLoudly);
