/**
 * the plain words onze uses for its numbers, in one place so the ui, the basic
 * report and the coach prompt all say the same thing. no stats jargon: a
 * casual fpl player should read every label without a glossary
 */

import type { AnalysisSummary } from './analysis-summary.js';
import type { PlanReason, PlanWeek, TransferPlan } from './analysis/planner.js';
import type {
  AnalysisPlayer,
  FixtureDifficulty,
  PlayerStatus,
  Position,
} from './analysis/types.js';

/** lower bounds, as chances from 0 to 1 */
export const PLAYING_THRESHOLDS = { nailedOn: 0.9, likely: 0.6, rotationRisk: 0.3 };
// set from gameweek 11 of 2026-27: high is about the top tenth of regular attackers
export const GOAL_THREAT_THRESHOLDS = { high: 0.35, medium: 0.2 };
// set from the same week, where teams ranged from about 10% to 40%
export const CLEAN_SHEET_THRESHOLDS = { good: 0.3, fair: 0.18 };
// fpl's own 1 to 5 fixture difficulty; a double averages its two games
export const FIXTURE_THRESHOLDS = { easyAtMost: 2, toughFrom: 4 };

export type PlayingLabel =
  | 'Nailed on'
  | 'Likely to play'
  | 'Rotation risk'
  | 'Unlikely to play'
  | 'Injured'
  | 'Suspended';
export type ThreatLevel = 'High' | 'Medium' | 'Low';
export type CleanSheetLevel = 'Good' | 'Fair' | 'Poor';
export type FixtureEase = 'Easy' | 'Medium' | 'Tough';

/** words that mean nothing to a casual player; none of them may reach the ui */
export const JARGON = [
  'projection',
  'projected',
  'model',
  'blend',
  'xG',
  'xA',
  'Poisson',
  'ep_next',
  'epNext',
  'per 90',
] as const;

export const HOW_ONZE_PREDICTS_TITLE = 'How does Onze predict?';
export const HOW_ONZE_PREDICTS =
  "Onze looks at who's been playing, how often they score, assist and keep clean sheets, how tough the next match is, and the latest injury news, then predicts each player's points. It was tested on a full past season it had never seen.";

/** fpl's injury and suspension news wins; otherwise the chance decides */
export function playingLabel(chance: number, status: PlayerStatus): PlayingLabel {
  assertChance(chance);
  if (status === 'i') return 'Injured';
  if (status === 's') return 'Suspended';
  if (chance >= PLAYING_THRESHOLDS.nailedOn) return 'Nailed on';
  if (chance >= PLAYING_THRESHOLDS.likely) return 'Likely to play';
  if (chance >= PLAYING_THRESHOLDS.rotationRisk) return 'Rotation risk';
  return 'Unlikely to play';
}

/** from the chance he scores or assists, if he plays */
export function goalThreatLevel(chance: number): ThreatLevel {
  assertChance(chance);
  if (chance >= GOAL_THREAT_THRESHOLDS.high) return 'High';
  if (chance >= GOAL_THREAT_THRESHOLDS.medium) return 'Medium';
  return 'Low';
}

export function cleanSheetLevel(chance: number): CleanSheetLevel {
  assertChance(chance);
  if (chance >= CLEAN_SHEET_THRESHOLDS.good) return 'Good';
  if (chance >= CLEAN_SHEET_THRESHOLDS.fair) return 'Fair';
  return 'Poor';
}

/** null in a blank: there is no fixture to rate */
export function fixtureEase(
  fixtures: readonly FixtureDifficulty[],
  event: number,
): FixtureEase | null {
  const games = fixtures.filter((fixture) => fixture.event === event);
  if (games.length === 0) return null;
  const average =
    games.reduce((sum, fixture) => sum + fixture.difficulty, 0) / games.length;
  if (!Number.isFinite(average)) throw new Error('fixture difficulty must be a number');
  if (average <= FIXTURE_THRESHOLDS.easyAtMost) return 'Easy';
  if (average >= FIXTURE_THRESHOLDS.toughFrom) return 'Tough';
  return 'Medium';
}

/** "Onze predicts 5.4 pts" */
export function predictsPoints(points: number): string {
  return `Onze predicts ${points.toFixed(1)} pts`;
}

/** "about 3 more points", rounded to a whole number as people say it */
export function aboutPoints(difference: number): string {
  if (!Number.isFinite(difference))
    throw new Error('a points difference must be a number');
  const whole = Math.round(Math.abs(difference));
  const direction = difference >= 0 ? 'more' : 'fewer';
  if (whole === 0) return `slightly ${direction} points`;
  return `about ${whole} ${direction} point${whole === 1 ? '' : 's'}`;
}

/** every label for one player; null where a label doesn't apply */
export interface PlainPlayer {
  name: string;
  team: string;
  /** rounded to one decimal place, as shown */
  predictedPoints: number;
  playing: PlayingLabel;
  goalThreat: ThreatLevel | null;
  cleanSheet: CleanSheetLevel | null;
  fixture: FixtureEase | null;
}

// a keeper's goal threat says nothing; a midfielder's or forward's clean sheet little
const SHOWS_GOAL_THREAT: Record<Position, boolean> = {
  GK: false,
  DEF: true,
  MID: true,
  FWD: true,
};

export function plainPlayer(player: AnalysisPlayer, event: number): PlainPlayer {
  const { projection } = player;
  return {
    name: player.webName,
    team: player.teamShortName,
    predictedPoints: Math.round(projection.points * 10) / 10,
    playing: playingLabel(projection.chanceOfPlaying, player.status),
    goalThreat:
      SHOWS_GOAL_THREAT[player.position] && projection.goalOrAssistChance !== null
        ? goalThreatLevel(projection.goalOrAssistChance)
        : null,
    cleanSheet:
      projection.cleanSheetChance === null
        ? null
        : cleanSheetLevel(projection.cleanSheetChance),
    fixture: fixtureEase(player.nextFixtures, event),
  };
}

/** "Nailed on · High goal threat · Easy fixture": the labels without the points */
export function labelLine(player: AnalysisPlayer, event: number): string {
  const plain = plainPlayer(player, event);
  return [
    plain.playing,
    plain.goalThreat === null ? null : `${plain.goalThreat} goal threat`,
    plain.cleanSheet === null ? null : `${plain.cleanSheet} chance of a clean sheet`,
    plain.fixture === null ? 'No match this week' : `${plain.fixture} fixture`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** "Onze predicts 5.4 pts · Nailed on · High goal threat · Easy fixture" */
export function cardLine(player: AnalysisPlayer, event: number): string {
  return `${predictsPoints(player.projection.points)} · ${labelLine(player, event)}`;
}

const PLAYING_PHRASE: Record<PlayingLabel, string> = {
  'Nailed on': 'is nailed on',
  'Likely to play': 'is likely to play',
  'Rotation risk': 'is a rotation risk',
  'Unlikely to play': 'is unlikely to play',
  Injured: 'is injured',
  Suspended: 'is suspended',
};

/** the same labels as prose: "Haaland is nailed on, with a high goal threat and an easy fixture." */
export function labelSentence(player: AnalysisPlayer, event: number): string {
  const plain = plainPlayer(player, event);
  const article = (word: string) => (/^[AEIOU]/.test(word) ? 'an' : 'a');
  const parts = [
    plain.goalThreat === null
      ? null
      : `${article(plain.goalThreat)} ${plain.goalThreat.toLowerCase()} goal threat`,
    plain.cleanSheet === null
      ? null
      : `${article(plain.cleanSheet)} ${plain.cleanSheet.toLowerCase()} chance of a clean sheet`,
    plain.fixture === null
      ? 'no match this week'
      : `${article(plain.fixture)} ${plain.fixture.toLowerCase()} fixture`,
  ].filter((part): part is string => part !== null);
  const last = parts.pop();
  const listed = parts.length === 0 ? last : `${parts.join(', ')} and ${last ?? ''}`;
  return `${player.webName} ${PLAYING_PHRASE[plain.playing]}, with ${listed ?? ''}.`;
}

/** the exact numbers behind the labels, for a tap-to-expand */
export function exactNumbers(player: AnalysisPlayer): string[] {
  const { projection } = player;
  const percent = (chance: number) => `${Math.round(chance * 100)}%`;
  return [
    `${percent(projection.chanceOfPlaying)} chance of playing`,
    `${projection.pointsIfPlaying.toFixed(1)} pts if he plays`,
    projection.goalOrAssistChance === null || !SHOWS_GOAL_THREAT[player.position]
      ? null
      : `${percent(projection.goalOrAssistChance)} chance to score or assist if he plays`,
    projection.cleanSheetChance === null
      ? null
      : `${percent(projection.cleanSheetChance)} chance of a clean sheet`,
  ].filter((line): line is string => line !== null);
}

/** "Onze thinks Gabriel will score about 3 more points than Dasilva this week." */
export function transferSentence(
  incoming: AnalysisPlayer,
  outgoing: AnalysisPlayer,
  gain: number,
): string {
  return `Onze thinks ${incoming.webName} will score ${aboutPoints(gain)} than ${outgoing.webName} this week.`;
}

/**
 * "Captain Haaland: Onze predicts 7.3 pts, the highest in your team." the
 * claim is only made when it's true of the whole squad, not just the eleven
 */
export function captainSentence(
  captain: AnalysisPlayer,
  squad: readonly AnalysisPlayer[],
): string {
  const highest = squad.every(
    (player) => player.projection.points <= captain.projection.points,
  );
  const rank = highest
    ? 'the highest in your team'
    : 'the highest in your starting eleven';
  return `Captain ${captain.webName}: ${predictsPoints(captain.projection.points)}, ${rank}.`;
}

/** every player the summary names, once each, with their labels */
export function plainPlayers(summary: AnalysisSummary): PlainPlayer[] {
  const seen = new Map<number, AnalysisPlayer>();
  const add = (player: AnalysisPlayer) => {
    if (!seen.has(player.id)) seen.set(player.id, player);
  };
  summary.squad.squad.forEach(add);
  for (const suggestion of summary.transfers.suggestions) {
    add(suggestion.outPlayer);
    suggestion.inCandidates.forEach(add);
  }
  summary.captaincy.candidates.forEach(({ player }) => add(player));
  return [...seen.values()].map((player) => plainPlayer(player, summary.currentEvent));
}

function assertChance(chance: number): void {
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new Error(`a chance must be from 0 to 1, got ${chance}`);
  }
}

/** "GW12: Dasilva → Gabriel (free)", or "GW13: Save your transfer (you'll have 2)" */
export function planWeekHeadline(week: PlanWeek): string {
  if (week.swaps.length === 0) {
    const noun = week.freeTransfers === 1 ? 'transfer' : 'transfers';
    const after =
      week.freeTransfersAfter === week.freeTransfers
        ? `you'll stay on ${week.freeTransfersAfter}, the most you can bank`
        : `you'll have ${week.freeTransfersAfter}`;
    return `GW${week.event}: Save your ${noun} (${after})`;
  }
  const moves = week.swaps.map((swap) => `${swap.out.webName} → ${swap.in.webName}`);
  const costs = week.swaps.map((swap) => (swap.hit ? '-4' : 'free'));
  return `GW${week.event}: ${joinWithAnd(moves)} (${costs.join(', ')})`;
}

/** one plain sentence on why a week of the plan does what it does */
export function planReasonSentence(reason: PlanReason): string {
  switch (reason.kind) {
    case 'replaces_absent':
      return `${reason.outName} is ${reason.status}.`;
    case 'double':
      return `${reason.teamName} play twice in GW${reason.event}.`;
    case 'easy_run':
      return reason.startsHere
        ? `${reason.teamName}'s easy run starts in GW${reason.fromEvent}.`
        : `${reason.teamName} have easy fixtures from GW${reason.fromEvent}.`;
    case 'outscores': {
      const span =
        reason.weeks === 1 ? 'this week' : `over the next ${reason.weeks} weeks`;
      return `Onze thinks ${reason.inName} will score ${aboutPoints(reason.points)} than ${reason.outName} ${span}.`;
    }
    case 'save_for':
      return reason.swapsThen >= 2
        ? `Saving lets you make ${reason.swapsThen} moves in GW${reason.nextEvent}.`
        : `No swap is worth a transfer until GW${reason.nextEvent}.`;
    case 'nothing_worth_it':
      return 'No swap gains enough to be worth a transfer.';
  }
}

/**
 * one or two sentences on the plan, for the written report. when the plan
 * would do this week differently from the advice, it says so first:
 * "Planning 5 weeks ahead, Onze would rather make Ajayi → Van Hecke this
 * week, then Cherki → McGinn in GW12. Aston Villa have easy fixtures from GW12."
 */
export function planOutlook(plan: TransferPlan, differsThisWeek: boolean): string {
  const [thisWeek, ...later] = plan.weeks;
  if (thisWeek === undefined) return '';
  const firstMove = later.find((week) => week.swaps.length > 0);
  const movesOf = (week: PlanWeek) =>
    joinWithAnd(week.swaps.map((swap) => `${swap.out.webName} → ${swap.in.webName}`));
  const saved = later.filter(
    (week) => firstMove === undefined || week.event < firstMove.event,
  );
  const savedText = joinWithAnd(saved.map((week) => `GW${week.event}`));
  const next =
    firstMove === undefined
      ? `then bank your transfers, as no swap is worth one in ${savedText}`
      : saved.length === 0
        ? `then ${movesOf(firstMove)} in GW${firstMove.event}`
        : `then save your transfer in ${savedText} and make ${movesOf(firstMove)} in GW${firstMove.event}`;
  const why = firstMove === undefined ? '' : ` ${planReasonSentence(firstMove.reason)}`;
  if (differsThisWeek) {
    const now =
      thisWeek.swaps.length === 0 ? 'save your transfer' : `make ${movesOf(thisWeek)}`;
    return `Planning ${plan.weeks.length} weeks ahead, Onze would rather ${now} this week, ${next}.${why}`;
  }
  if (firstMove === undefined) {
    return later.length === 0
      ? ''
      : 'Looking ahead, no swap is worth a transfer in the weeks after this one, so bank them.';
  }
  const lead =
    saved.length === 0
      ? `Looking ahead, Onze's next move is ${movesOf(firstMove)} in GW${firstMove.event}.`
      : `Looking ahead, save your transfer in ${savedText}, then ${movesOf(firstMove)} in GW${firstMove.event}.`;
  return `${lead}${why}`;
}

function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}
