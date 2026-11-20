import type { Position } from '../analysis/types.js';
import type { GameweekResult } from './backtest.js';
import type { Projector } from './baselines.js';
import type { BootstrapOptions } from './bootstrap.js';
import { haulValue, pairedDifference, pairedMetricDifference } from './compare.js';
import type { Difference, GameweekHauls, GameweekKey } from './compare.js';
import { CAPTAIN_POOL, TOP_PICKS } from './metrics.js';
import type { GameweekCase } from './snapshot.js';

export const POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/** one player-gameweek: both models' projections next to what happened */
export interface BlendExample {
  position: Position;
  twoPart: number;
  event: number;
  actual: number;
}

/**
 * every target of the cases with both projections, for choosing a blend
 * weight. everyone with a fixture counts, benched or not, as the blend has to
 * be right about both
 */
export function blendExamples(
  cases: readonly GameweekCase[],
  twoPart: Projector,
  event: Projector,
): BlendExample[] {
  const examples: BlendExample[] = [];
  for (const { history, targets, outcomes } of cases) {
    for (const target of targets) {
      const outcome = outcomes.get(target.playerId);
      if (outcome === undefined) {
        throw new Error(`no outcome for player ${target.playerId}`);
      }
      examples.push({
        position: target.position,
        twoPart: projected(twoPart, target, history),
        event: projected(event, target, history),
        actual: outcome.totalPoints,
      });
    }
  }
  return examples;
}

function projected(
  projector: Projector,
  target: GameweekCase['targets'][number],
  history: GameweekCase['history'],
): number {
  const value = projector.project(target, history);
  if (value === null) {
    throw new Error(
      `${projector.label} has no projection for player ${target.playerId}`,
    );
  }
  return value;
}

/**
 * the w in w x two-part + (1 - w) x event with the least squared error,
 * kept to [0, 1] so the blend never bets against either model. the error is
 * quadratic in w, so the best one is exact rather than searched for
 */
export function bestBlendWeight(examples: readonly BlendExample[]): number {
  if (examples.length === 0) throw new Error('no examples to choose a blend weight on');
  let along = 0;
  let spread = 0;
  for (const example of examples) {
    const gap = example.twoPart - example.event;
    along += (example.actual - example.event) * gap;
    spread += gap * gap;
  }
  // the models agree everywhere, so any w is the same; keep the two-part model
  if (spread === 0) return 1;
  return Math.min(1, Math.max(0, along / spread));
}

export function bestBlendWeightsByPosition(
  examples: readonly BlendExample[],
): Record<Position, number> {
  const weightOf = (position: Position) =>
    bestBlendWeight(examples.filter((example) => example.position === position));
  return {
    GK: weightOf('GK'),
    DEF: weightOf('DEF'),
    MID: weightOf('MID'),
    FWD: weightOf('FWD'),
  };
}

export function blendProjector(
  twoPart: Projector,
  event: Projector,
  weightFor: (position: Position) => number,
  label: string,
): Projector {
  return {
    id: 'blend',
    label,
    describe:
      'w x the two-part model + (1 - w) x the event model, w chosen on the tune seasons, never the season scored',
    project: (target, history) => {
      const a = twoPart.project(target, history);
      const b = event.project(target, history);
      if (a === null || b === null) return null;
      const weight = weightFor(target.position);
      return weight * a + (1 - weight) * b;
    },
  };
}

/** answers each player-gameweek once, as the blends ask both models again */
export function memoised(projector: Projector): Projector {
  const answers = new Map<string, number | null>();
  return {
    ...projector,
    project: (target, history) => {
      const key = `${target.season}/${target.gameweek}/${target.playerId}`;
      const known = answers.get(key);
      if (known !== undefined) return known;
      const value = projector.project(target, history);
      answers.set(key, value);
      return value;
    },
  };
}

/**
 * routing: the shortlist (top 5, top 20) comes from one model and the
 * captain from another. captain regret and captain points are the captaincy
 * model's own, as the routed captain is exactly its pick
 */
export function routeGameweeks(
  shortlist: readonly GameweekResult[],
  captaincy: readonly GameweekResult[],
): GameweekResult[] {
  assertAligned(shortlist, captaincy);
  return shortlist.map((result, index) => ({
    ...result,
    parts: { ...result.parts, captainRegret: at(captaincy, index).parts.captainRegret },
  }));
}

export function routeHauls(
  shortlist: readonly GameweekHauls[],
  captaincy: readonly GameweekHauls[],
): GameweekHauls[] {
  assertAligned(shortlist, captaincy);
  return shortlist.map((hauls, index) => {
    const captain = at(captaincy, index).parts;
    return {
      ...hauls,
      parts: {
        haulsShortlisted: hauls.parts.haulsShortlisted,
        captainPoints: captain.captainPoints,
        captainHauled: captain.captainHauled,
      },
    };
  });
}

export type DecisionMeasureId = 'topFive' | 'haulsShortlisted' | 'captainRegret';

/** the three measures the ship decision reads, fixed before any ensemble was scored */
export const DECISION_MEASURES: readonly {
  id: DecisionMeasureId;
  label: string;
  better: 'lower' | 'higher';
}[] = [
  { id: 'topFive', label: `Top-${TOP_PICKS} hit`, better: 'higher' },
  {
    id: 'haulsShortlisted',
    label: `Haul share in the top ${CAPTAIN_POOL}`,
    better: 'higher',
  },
  { id: 'captainRegret', label: 'Captain regret', better: 'lower' },
];

export type Reading = 'better' | 'worse' | 'unclear';

/** candidate minus incumbent: clearly better or worse only when the interval excludes 0 */
export function readDifference(
  difference: Difference,
  better: 'lower' | 'higher',
): Reading {
  const interval = difference.interval;
  if (interval === null) return 'unclear';
  if (better === 'higher' ? interval.low > 0 : interval.high < 0) return 'better';
  if (better === 'higher' ? interval.high < 0 : interval.low > 0) return 'worse';
  return 'unclear';
}

export interface Decision {
  readings: Record<DecisionMeasureId, Reading>;
  ship: boolean;
}

/** clearly better on at least one decision measure and clearly worse on none */
export function decide(differences: Record<DecisionMeasureId, Difference>): Decision {
  const readings: Record<DecisionMeasureId, Reading> = {
    topFive: 'unclear',
    haulsShortlisted: 'unclear',
    captainRegret: 'unclear',
  };
  for (const measure of DECISION_MEASURES) {
    readings[measure.id] = readDifference(differences[measure.id], measure.better);
  }
  const values = Object.values(readings);
  return {
    readings,
    ship: values.includes('better') && !values.includes('worse'),
  };
}

/**
 * the final exam's rule: the candidate ships unless it is clearly worse on a
 * decision measure. a lower bar than decide, as the tune seasons already
 * showed the gain; the test season only has to not contradict it
 */
export function decideNotWorse(
  differences: Record<DecisionMeasureId, Difference>,
): Decision {
  const { readings } = decide(differences);
  return { readings, ship: !Object.values(readings).includes('worse') };
}

/** a model's scored gameweeks, on the harness metrics and the haul measures */
export interface ScoredRun {
  gameweeks: readonly GameweekResult[];
  hauls: readonly GameweekHauls[];
}

/** candidate minus incumbent on each decision measure, on the same resampled gameweeks */
export function decisionDifferences(
  candidate: ScoredRun,
  incumbent: ScoredRun,
  options: BootstrapOptions,
): Record<DecisionMeasureId, Difference> {
  return {
    topFive: pairedMetricDifference(
      candidate.gameweeks,
      incumbent.gameweeks,
      'topFive',
      options,
    ),
    haulsShortlisted: pairedDifference(
      candidate.hauls,
      incumbent.hauls,
      (sample) => haulValue('haulsShortlisted', sample),
      options,
    ),
    captainRegret: pairedMetricDifference(
      candidate.gameweeks,
      incumbent.gameweeks,
      'captainRegret',
      options,
    ),
  };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no gameweek at ${index}`);
  return item;
}

function assertAligned(a: readonly GameweekKey[], b: readonly GameweekKey[]): void {
  const same =
    a.length === b.length &&
    a.every(
      (key, index) =>
        key.season === b[index]?.season && key.gameweek === b[index]?.gameweek,
    );
  if (!same) {
    throw new Error('routed runs must score the same gameweeks in the same order');
  }
}
