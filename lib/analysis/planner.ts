import {
  HIT_SAFETY_MARGIN,
  MAX_HITS_PER_WEEK,
  MAX_PLAYERS_PER_CLUB,
  POINTS_PER_HIT,
  isAvailableToBuy,
  nextFreeTransfers,
} from './transfers.js';
import type { TransfersAnalysis } from './transfers.js';
import type { AnalysisPlayer, PlayerStatus, Position, SquadContext } from './types.js';

/**
 * a beam search over transfer plans for the next few gameweeks. each week a
 * plan can save its transfer or make up to three swaps, and every week the
 * best eleven and captain are picked inside the plan. pure: players in, plan out
 */

// later weeks are less certain (injuries, rotation, form), so each week counts
// 0.85 of the one before: 1, 0.85, 0.72, 0.61, 0.52 over five weeks
export const WEEK_DECAY = 0.85;

/**
 * plans kept after each week. on two real squads, from 1 to 160, the best
 * plan stopped changing at 10 (at 5 one squad still took a needless hit), so
 * 40 keeps a fourfold margin and the search still takes about 30 ms
 */
export const PLAN_BEAM_WIDTH = 40;

// a swap must be predicted to gain at least this much over the weeks left
// (weighted). less is within the prediction's noise, and spending a transfer
// on it gives up one that could be banked for a bigger move
export const MIN_SWAP_GAIN = 1;

// three swaps cover what a normal week needs; more is wildcard territory
const MAX_SWAPS_PER_WEEK = 3;
// affordable replacements tried for each player, best first
const REPLACEMENTS_PER_PLAYER = 5;
// single swaps kept per plan per week, and how many of those are paired up
const SINGLE_SWAPS_KEPT = 20;
const PAIRED_FROM_TOP = 12;
const TRIPLED_FROM_TOP = 6;
// each banked count keeps a few plans, so saving a transfer is never pruned
// just because its pay-off comes in a later week
const PLANS_KEPT_PER_BANKED_COUNT = 3;

export interface PlanPlayer {
  id: number;
  webName: string;
  teamName: string;
  position: Position;
  nowCost: number;
}

export interface PlannedSwap {
  out: PlanPlayer;
  in: PlanPlayer;
  /** predicted points gained over the rest of the plan, unweighted */
  gain: number;
  /** the swap beyond the free ones, paid for with a -4 */
  hit: boolean;
}

/** why a week does what it does: data for the plain sentence, not the sentence */
export type PlanReason =
  | { kind: 'replaces_absent'; outName: string; status: 'injured' | 'suspended' }
  | { kind: 'double'; teamName: string; event: number }
  | { kind: 'easy_run'; teamName: string; fromEvent: number; startsHere: boolean }
  | {
      kind: 'outscores';
      inName: string;
      outName: string;
      points: number;
      weeks: number;
    }
  | {
      kind: 'save_for';
      nextEvent: number;
      freeTransfersThen: number;
      swapsThen: number;
    }
  | { kind: 'nothing_worth_it' };

export interface PlanWeek {
  event: number;
  swaps: PlannedSwap[];
  /** free transfers going into the week */
  freeTransfers: number;
  /** banked into the following week */
  freeTransfersAfter: number;
  hits: number;
  /** after the week's swaps, fpl cost units */
  bankAfter: number;
  captain: PlanPlayer | null;
  /** best eleven plus the captain's second share, unweighted */
  predictedPoints: number;
  reason: PlanReason;
}

export interface TransferPlan {
  weeks: PlanWeek[];
  weekWeights: number[];
  /** predicted points, each week weighted */
  weightedPoints: number;
  hitCost: number;
  /** weightedPoints minus hitCost: what the search maximises */
  objective: number;
  beamWidth: number;
}

export interface PlanOptions {
  /** gameweeks planned, the current one first */
  weeks: number;
  beamWidth?: number;
  /** protecting a lead beats marginal points, so no hits at all */
  isLeadingALeague?: boolean;
}

export function weekWeights(weeks: number): number[] {
  return Array.from({ length: weeks }, (_, week) => WEEK_DECAY ** week);
}

/** one player's predicted points in a week of the plan; 0 past what was predicted */
export function weekPoints(player: AnalysisPlayer, week: number): number {
  return player.projection.weeklyPoints[week] ?? 0;
}

export interface WeekLineup {
  /** the eleven's points plus the captain's again */
  points: number;
  captain: AnalysisPlayer | null;
}

// fpl's legal outfield shapes: def 3-5, mid 2-5, fwd 1-3, ten in all
const FORMATIONS: readonly { DEF: number; MID: number; FWD: number }[] = [
  3, 4, 5,
].flatMap((DEF) =>
  [2, 3, 4, 5].flatMap((MID) => {
    const FWD = 10 - DEF - MID;
    return FWD >= 1 && FWD <= 3 ? [{ DEF, MID, FWD }] : [];
  }),
);

/** the best legal eleven and its captain for one week */
export function bestWeekLineup(
  squad: readonly AnalysisPlayer[],
  week: number,
): WeekLineup {
  const sorted = (position: Position) =>
    squad
      .filter((player) => player.position === position)
      .map((player) => ({ player, points: weekPoints(player, week) }))
      .sort((a, b) => b.points - a.points);
  const byPosition = {
    GK: sorted('GK'),
    DEF: sorted('DEF'),
    MID: sorted('MID'),
    FWD: sorted('FWD'),
  };
  const keeper = byPosition.GK[0];
  if (keeper === undefined) return { points: 0, captain: null };
  let best: { points: number; captain: AnalysisPlayer | null } | null = null;
  for (const shape of FORMATIONS) {
    const outfield = [
      ...byPosition.DEF.slice(0, shape.DEF),
      ...byPosition.MID.slice(0, shape.MID),
      ...byPosition.FWD.slice(0, shape.FWD),
    ];
    if (outfield.length !== shape.DEF + shape.MID + shape.FWD) {
      continue;
    }
    const eleven = [keeper, ...outfield];
    const top = eleven.reduce((a, b) => (b.points > a.points ? b : a));
    const points = eleven.reduce((sum, entry) => sum + entry.points, 0) + top.points;
    if (best === null || points > best.points) best = { points, captain: top.player };
  }
  return best ?? { points: 0, captain: null };
}

interface Swap {
  out: AnalysisPlayer;
  in: AnalysisPlayer;
  /** weighted predicted gain over the weeks left, for ordering and the hit rule */
  value: number;
}

interface Plan {
  squad: AnalysisPlayer[];
  bank: number;
  freeTransfers: number;
  weightedPoints: number;
  hitCost: number;
  /** what's banked plus the squad's weeks ahead with no more swaps */
  rank: number;
  /** players sold earlier in the plan, never bought back: that's churn */
  sold: ReadonlySet<number>;
  weeks: { swaps: Swap[]; freeTransfers: number; hits: number; bank: number }[];
}

export function planTransfers(
  squad: SquadContext,
  pool: readonly AnalysisPlayer[],
  options: PlanOptions,
): TransferPlan {
  const weeks = options.weeks;
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new Error(`a plan needs at least one whole week, got ${weeks}`);
  }
  const beamWidth = options.beamWidth ?? PLAN_BEAM_WIDTH;
  if (!Number.isInteger(beamWidth) || beamWidth < 1) {
    throw new Error(`the beam must keep at least one plan, got ${beamWidth}`);
  }
  const weights = weekWeights(weeks);
  const allowHits = options.isLeadingALeague !== true;

  // a player's weighted points from each week to the end, worked out once
  const remaining = new Map<number, number[]>();
  const remainingFrom = (player: AnalysisPlayer, week: number): number => {
    let values = remaining.get(player.id);
    if (values === undefined) {
      values = new Array<number>(weeks + 1).fill(0);
      for (let w = weeks - 1; w >= 0; w -= 1) {
        values[w] = (values[w + 1] ?? 0) + (weights[w] ?? 0) * weekPoints(player, w);
      }
      remaining.set(player.id, values);
    }
    return values[week] ?? 0;
  };
  // who can be bought, per position and week, best for the weeks left first
  const buyable = pool.filter(isAvailableToBuy);
  const ranked = new Map<string, AnalysisPlayer[]>();
  const rankedFor = (position: Position, week: number): AnalysisPlayer[] => {
    const key = `${position}/${week}`;
    let list = ranked.get(key);
    if (list === undefined) {
      list = buyable
        .filter((player) => player.position === position)
        .sort((a, b) => remainingFrom(b, week) - remainingFrom(a, week));
      ranked.set(key, list);
    }
    return list;
  };
  const futureWithoutSwaps = (players: readonly AnalysisPlayer[], fromWeek: number) => {
    let total = 0;
    for (let w = fromWeek; w < weeks; w += 1) {
      total += (weights[w] ?? 0) * bestWeekLineup(players, w).points;
    }
    return total;
  };

  let beam: Plan[] = [
    {
      squad: [...squad.squad],
      bank: squad.bank,
      freeTransfers: squad.freeTransfers,
      weightedPoints: 0,
      hitCost: 0,
      rank: 0,
      sold: new Set<number>(),
      weeks: [],
    },
  ];
  for (let week = 0; week < weeks; week += 1) {
    const next = new Map<string, Plan>();
    for (const plan of beam) {
      for (const swaps of swapSets(plan, week, rankedFor, remainingFrom)) {
        const child = applyWeek(plan, swaps, week, {
          allowHits,
          weight: weights[week] ?? 0,
          future: futureWithoutSwaps,
        });
        if (child === null) continue;
        const key = planKey(child);
        const known = next.get(key);
        if (known === undefined || child.rank > known.rank) next.set(key, child);
      }
    }
    beam = keepBest([...next.values()], beamWidth);
  }

  const best = beam.reduce((a, b) =>
    b.weightedPoints - b.hitCost > a.weightedPoints - a.hitCost ? b : a,
  );
  return describePlan(best, squad, weights, beamWidth);
}

/** saving, every good single swap, and pairs and triples of the best ones */
function swapSets(
  plan: Plan,
  week: number,
  rankedFor: (position: Position, week: number) => AnalysisPlayer[],
  remainingFrom: (player: AnalysisPlayer, week: number) => number,
): Swap[][] {
  const owned = new Set(plan.squad.map((player) => player.id));
  const clubs = clubCounts(plan.squad);
  const singles: Swap[] = [];
  for (const out of plan.squad) {
    let found = 0;
    for (const candidate of rankedFor(out.position, week)) {
      if (found >= REPLACEMENTS_PER_PLAYER) break;
      const value = remainingFrom(candidate, week) - remainingFrom(out, week);
      // the list is best first, so nothing further down gains more
      if (value < MIN_SWAP_GAIN) break;
      if (owned.has(candidate.id) || plan.sold.has(candidate.id)) continue;
      if (candidate.nowCost > out.nowCost + plan.bank) continue;
      const atClub =
        (clubs.get(candidate.teamId) ?? 0) - (candidate.teamId === out.teamId ? 1 : 0);
      if (atClub >= MAX_PLAYERS_PER_CLUB) continue;
      singles.push({ out, in: candidate, value });
      found += 1;
    }
  }
  singles.sort((a, b) => b.value - a.value);
  const kept = singles.slice(0, SINGLE_SWAPS_KEPT);
  const sets: Swap[][] = [[], ...kept.map((swap) => [swap])];
  const paired = kept.slice(0, PAIRED_FROM_TOP);
  for (let i = 0; i < paired.length; i += 1) {
    for (let j = i + 1; j < paired.length; j += 1) {
      sets.push([paired[i], paired[j]].filter(isSwap));
    }
  }
  const tripled = kept.slice(0, TRIPLED_FROM_TOP);
  for (let i = 0; i < tripled.length; i += 1) {
    for (let j = i + 1; j < tripled.length; j += 1) {
      for (let k = j + 1; k < tripled.length; k += 1) {
        sets.push([tripled[i], tripled[j], tripled[k]].filter(isSwap));
      }
    }
  }
  return sets;
}

function isSwap(swap: Swap | undefined): swap is Swap {
  return swap !== undefined;
}

interface WeekContext {
  allowHits: boolean;
  weight: number;
  future: (players: readonly AnalysisPlayer[], fromWeek: number) => number;
}

/** the plan after one week's swaps, or null when they break a rule */
function applyWeek(
  plan: Plan,
  swaps: readonly Swap[],
  week: number,
  context: WeekContext,
): Plan | null {
  if (swaps.length > MAX_SWAPS_PER_WEEK) return null;
  const outs = new Set(swaps.map((swap) => swap.out.id));
  const ins = new Set(swaps.map((swap) => swap.in.id));
  if (outs.size !== swaps.length || ins.size !== swaps.length) return null;

  const hits = Math.max(0, swaps.length - plan.freeTransfers);
  if (hits > 0) {
    if (!context.allowHits || hits > MAX_HITS_PER_WEEK) return null;
    // the weakest swap is the one the hit pays for, so it alone must clear
    // the cost with the same margin as the one-week rule
    const weakest = Math.min(...swaps.map((swap) => swap.value));
    if (weakest <= POINTS_PER_HIT + HIT_SAFETY_MARGIN) return null;
  }

  const bank =
    plan.bank +
    swaps.reduce((sum, swap) => sum + swap.out.nowCost - swap.in.nowCost, 0);
  // fpl checks the money after all of a week's swaps, not one at a time
  if (bank < 0) return null;
  const squad = plan.squad.map(
    (player) => swaps.find((swap) => swap.out.id === player.id)?.in ?? player,
  );
  for (const count of clubCounts(squad).values()) {
    if (count > MAX_PLAYERS_PER_CLUB) return null;
  }

  const weightedPoints =
    plan.weightedPoints + context.weight * bestWeekLineup(squad, week).points;
  const hitCost = plan.hitCost + hits * POINTS_PER_HIT;
  return {
    squad,
    bank,
    freeTransfers: nextFreeTransfers(plan.freeTransfers, swaps.length),
    weightedPoints,
    hitCost,
    rank: weightedPoints - hitCost + context.future(squad, week + 1),
    sold: new Set([...plan.sold, ...swaps.map((swap) => swap.out.id)]),
    weeks: [
      ...plan.weeks,
      { swaps: [...swaps], freeTransfers: plan.freeTransfers, hits, bank },
    ],
  };
}

function clubCounts(squad: readonly AnalysisPlayer[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of squad)
    counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
  return counts;
}

function planKey(plan: Plan): string {
  const ids = plan.squad.map((player) => player.id).sort((a, b) => a - b);
  return `${ids.join(',')}|${plan.freeTransfers}|${plan.bank}`;
}

/** the best plans, plus the best few for each number of banked transfers */
function keepBest(plans: Plan[], beamWidth: number): Plan[] {
  const sorted = [...plans].sort((a, b) => b.rank - a.rank);
  const kept = new Set(sorted.slice(0, beamWidth));
  const perBanked = new Map<number, number>();
  for (const plan of sorted) {
    const count = perBanked.get(plan.freeTransfers) ?? 0;
    if (count >= PLANS_KEPT_PER_BANKED_COUNT) continue;
    perBanked.set(plan.freeTransfers, count + 1);
    kept.add(plan);
  }
  return sorted.filter((plan) => kept.has(plan));
}

function toPlanPlayer(player: AnalysisPlayer): PlanPlayer {
  return {
    id: player.id,
    webName: player.webName,
    teamName: player.teamName,
    position: player.position,
    nowCost: player.nowCost,
  };
}

/** the chosen plan in the summary's shape, with each week's reason */
function describePlan(
  plan: Plan,
  start: SquadContext,
  weights: readonly number[],
  beamWidth: number,
): TransferPlan {
  let squad = [...start.squad];
  const firstEvent = start.currentEvent;
  const weeks: PlanWeek[] = plan.weeks.map((week, index) => {
    squad = squad.map(
      (player) => week.swaps.find((swap) => swap.out.id === player.id)?.in ?? player,
    );
    const lineup = bestWeekLineup(squad, index);
    const event = firstEvent + index;
    const ordered = [...week.swaps].sort((a, b) => b.value - a.value);
    const freeCount = ordered.length - week.hits;
    const swaps: PlannedSwap[] = ordered.map((swap, order) => ({
      out: toPlanPlayer(swap.out),
      in: toPlanPlayer(swap.in),
      gain: unweightedGain(swap, index, weights.length),
      hit: order >= freeCount,
    }));
    return {
      event,
      swaps,
      freeTransfers: week.freeTransfers,
      freeTransfersAfter: nextFreeTransfers(week.freeTransfers, week.swaps.length),
      hits: week.hits,
      bankAfter: week.bank,
      captain: lineup.captain === null ? null : toPlanPlayer(lineup.captain),
      predictedPoints: lineup.points,
      reason: { kind: 'nothing_worth_it' },
    };
  });
  return {
    weeks: weeks.map((week, index) => ({
      ...week,
      reason: reasonFor(week, index, plan.weeks[index]?.swaps ?? [], weeks, firstEvent),
    })),
    weekWeights: [...weights],
    weightedPoints: plan.weightedPoints,
    hitCost: plan.hitCost,
    objective: plan.weightedPoints - plan.hitCost,
    beamWidth,
  };
}

function unweightedGain(swap: Swap, fromWeek: number, weeks: number): number {
  let gain = 0;
  for (let w = fromWeek; w < weeks; w += 1) {
    gain += weekPoints(swap.in, w) - weekPoints(swap.out, w);
  }
  return gain;
}

const ABSENT: Partial<Record<PlayerStatus, 'injured' | 'suspended'>> = {
  i: 'injured',
  s: 'suspended',
};
// fpl's 1 to 5 difficulty: a run averaging this or less is an easy one
const EASY_RUN_DIFFICULTY = 2.5;
// a run is the next three gameweeks; one kind fixture isn't a run
const RUN_LENGTH = 3;

/** the one thing that best explains the week, about its biggest swap */
function reasonFor(
  week: PlanWeek,
  index: number,
  swaps: readonly Swap[],
  weeks: readonly PlanWeek[],
  firstEvent: number,
): PlanReason {
  const main = [...swaps].sort((a, b) => b.value - a.value)[0];
  if (main === undefined) {
    const later = weeks.slice(index + 1).find((other) => other.swaps.length > 0);
    return later === undefined
      ? { kind: 'nothing_worth_it' }
      : {
          kind: 'save_for',
          nextEvent: later.event,
          freeTransfersThen: later.freeTransfers,
          swapsThen: later.swaps.length,
        };
  }
  const absent = ABSENT[main.out.status];
  if (absent !== undefined) {
    return { kind: 'replaces_absent', outName: main.out.webName, status: absent };
  }
  const lastEvent = firstEvent + weeks.length - 1;
  for (let event = week.event; event <= lastEvent; event += 1) {
    const games = main.in.nextFixtures.filter((fixture) => fixture.event === event);
    if (games.length >= 2) {
      return { kind: 'double', teamName: main.in.teamName, event };
    }
  }
  const run = averageDifficulty(main.in, week.event, RUN_LENGTH);
  if (run !== null && run <= EASY_RUN_DIFFICULTY) {
    const before = averageDifficulty(main.in, week.event - 1, 1);
    return {
      kind: 'easy_run',
      teamName: main.in.teamName,
      fromEvent: week.event,
      startsHere: before !== null && before > EASY_RUN_DIFFICULTY,
    };
  }
  return {
    kind: 'outscores',
    inName: main.in.webName,
    outName: main.out.webName,
    points: unweightedGain(main, index, weeks.length),
    weeks: weeks.length - index,
  };
}

/** fpl's difficulty over `length` gameweeks from `fromEvent`; null without fixtures */
function averageDifficulty(
  player: AnalysisPlayer,
  fromEvent: number,
  length: number,
): number | null {
  const games = player.nextFixtures.filter(
    (fixture) => fixture.event >= fromEvent && fixture.event < fromEvent + length,
  );
  if (games.length === 0) return null;
  return games.reduce((sum, fixture) => sum + fixture.difficulty, 0) / games.length;
}

/**
 * true when the plan's first week isn't the one-week advice: planning ahead
 * can pick a different swap, or save, where this week alone would spend
 */
export function planDiffersFromAdvice(
  plan: TransferPlan,
  transfers: TransfersAnalysis,
): boolean {
  const key = (outId: number, inId: number | undefined) => `${outId}>${inId ?? 0}`;
  const planned = new Set(
    (plan.weeks[0]?.swaps ?? []).map((swap) => key(swap.out.id, swap.in.id)),
  );
  const advised = new Set(
    transfers.suggestions
      .slice(0, transfers.recommendedCount)
      .map((suggestion) =>
        key(suggestion.outPlayer.id, suggestion.inCandidates[0]?.id),
      ),
  );
  return (
    planned.size !== advised.size || [...planned].some((move) => !advised.has(move))
  );
}
