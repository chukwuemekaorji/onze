import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { ChipName } from '../lib/analysis/chips.js';
import type { PriceDirection } from '../lib/analysis/price-alerts.js';
import { HIT_SAFETY_MARGIN, POINTS_PER_HIT } from '../lib/analysis/transfers.js';
import { fixtureLabel } from './pitch-layout.js';

/** card-ready shapes for the binder pages, worked out from the analysis summary */

/** free and hit moves are recommended; skip means weighed and left alone */
export type TransferVerdict = 'free' | 'hit' | 'skip';

export interface TransferRow {
  outName: string;
  /** null when nothing affordable beats the outgoing player */
  inName: string | null;
  /** expected points gained before any hit */
  gain: number;
  verdict: TransferVerdict;
  /** the other replacements, best first, with prices */
  alternatives: string[];
}

export interface CaptainOption {
  rank: number;
  id: number;
  name: string;
  fixture: string;
  expectedPoints: number;
  role: 'captain' | 'vice' | null;
}

export type ChipState = 'recommended' | 'available' | 'used';

export interface ChipStamp {
  chip: ChipName;
  label: string;
  state: ChipState;
  /** the word stamped on it */
  verdict: string;
}

export interface PriceRow {
  id: number;
  name: string;
  price: string;
  direction: PriceDirection;
  note: string;
}

export interface GameweekMark {
  event: number;
  /** squad players whose team plays twice that week */
  doublePlayers: number;
  /** squad players whose team has no game that week */
  blankPlayers: number;
}

export const HIT_LABEL = `-${POINTS_PER_HIT}`;
export const CAPTAIN_OPTION_COUNT = 5;
export const TIMELINE_GAMEWEEKS = 5;

// a hit has to clear the cost and the safety margin, as in lib/analysis/transfers.ts
const HIT_THRESHOLD = POINTS_PER_HIT + HIT_SAFETY_MARGIN;

// fixed order so the chip stamps never shuffle between reports
const CHIP_ORDER: ChipName[] = [
  'wildcard',
  'free_hit',
  'bench_boost',
  'triple_captain',
];

const CHIP_LABEL: Record<ChipName, string> = {
  wildcard: 'Wildcard',
  free_hit: 'Free Hit',
  bench_boost: 'Bench Boost',
  triple_captain: 'Triple Captain',
};

// fpl prices are in tenths of a million
const PRICE_UNITS_PER_MILLION = 10;

export function formatPrice(nowCost: number): string {
  return `£${(nowCost / PRICE_UNITS_PER_MILLION).toFixed(1)}m`;
}

export function formatGain(points: number): string {
  const sign = points >= 0 ? '+' : '-';
  return `${sign}${Math.abs(points).toFixed(1)} pts`;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * every suggestion, best gain first. the first recommendedCount are the moves
 * to make, spending free transfers before any hit
 */
export function transferRows(transfers: AnalysisSummary['transfers']): TransferRow[] {
  return transfers.suggestions.map((suggestion, index) => {
    const [best, ...others] = suggestion.inCandidates;
    const verdict: TransferVerdict =
      index >= transfers.recommendedCount
        ? 'skip'
        : index < transfers.freeTransfers
          ? 'free'
          : 'hit';
    return {
      outName: suggestion.outPlayer.webName,
      inName: best?.webName ?? null,
      gain: suggestion.expectedPointsGain,
      verdict,
      alternatives: others.map((p) => `${p.webName} ${formatPrice(p.nowCost)}`),
    };
  });
}

/** one plain line on why a hit is or isn't worth taking this week */
export function hitAdvice(
  summary: Pick<AnalysisSummary, 'transfers' | 'leagueStandings'>,
): string {
  const { transfers } = summary;
  const rows = transferRows(transfers);
  const free = plural(transfers.freeTransfers, 'free transfer');

  if (rows.length === 0)
    return 'No weak links worth replacing, so there is no hit to weigh.';

  if (transfers.pointsHitCost > 0) {
    const hit = rows.find((row) => row.verdict === 'hit');
    if (hit) {
      return `The ${HIT_LABEL} is worth it: ${hit.outName} for ${hit.inName ?? 'a replacement'} gains about ${hit.gain.toFixed(1)} pts, more than the ${POINTS_PER_HIT} it costs plus a ${HIT_SAFETY_MARGIN}-point safety margin.`;
    }
  }

  const next = rows.find((row) => row.verdict === 'skip');
  if (!next) return `Your ${free} cover every move worth making, so no hit is needed.`;

  const leadingALeague = summary.leagueStandings.some((league) => league.rank === 1);
  if (next.gain > HIT_THRESHOLD && leadingALeague) {
    return `${next.outName} for ${next.inName ?? 'a replacement'} would gain about ${next.gain.toFixed(1)} pts, but you lead a league, so Sensei skips hits to protect it.`;
  }
  return `A ${HIT_LABEL} for ${next.outName} isn't worth it: the swap gains about ${next.gain.toFixed(1)} pts, short of the ${HIT_THRESHOLD} needed to beat the hit with a margin.`;
}

/** the recommended transfers in one line, for the this week page */
export function transferSummaryLine(transfers: AnalysisSummary['transfers']): string {
  const moves = transferRows(transfers).filter((row) => row.verdict !== 'skip');
  if (moves.length === 0) return 'No transfer worth making. Roll it.';
  const swaps = moves
    .map((m) => `${m.outName} for ${m.inName ?? 'nobody yet'}`)
    .join(', ');
  const hit = transfers.pointsHitCost > 0 ? `, one ${HIT_LABEL}` : '';
  return `${swaps} (${formatGain(transfers.projectedNetGain)}${hit})`;
}

/** the captaincy picks in one line, for the this week page */
export function captainSummaryLine(
  captaincy: AnalysisSummary['captaincy'],
  event: number,
): string {
  const { captain, viceCaptain } = captaincy;
  if (!captain) return 'No clear captain in this lineup.';
  const fixture = fixtureLabel(captain.player.nextFixtures, event);
  const vice = viceCaptain ? `, vice ${viceCaptain.player.webName}` : '';
  return `${captain.player.webName}, ${fixture}${vice}`;
}

/** the top captain options, best first, with the chosen c and v marked */
export function captainOptions(
  captaincy: AnalysisSummary['captaincy'],
  event: number,
  limit: number = CAPTAIN_OPTION_COUNT,
): CaptainOption[] {
  const captainId = captaincy.captain?.player.id;
  const viceId = captaincy.viceCaptain?.player.id;
  return captaincy.candidates.slice(0, limit).map(({ player }, index) => ({
    rank: index + 1,
    id: player.id,
    name: player.webName,
    fixture: fixtureLabel(player.nextFixtures, event),
    expectedPoints: player.epNext,
    role: player.id === captainId ? 'captain' : player.id === viceId ? 'vice' : null,
  }));
}

/** every chip, so the card also shows what's been used */
export function chipStamps(
  chipsUsed: ChipName[],
  suggestions: AnalysisSummary['chips']['suggestions'],
): ChipStamp[] {
  const used = new Set(chipsUsed);
  return CHIP_ORDER.map((chip) => {
    const label = CHIP_LABEL[chip];
    if (used.has(chip)) return { chip, label, state: 'used', verdict: 'Used' };
    const recommendation = suggestions.find((s) => s.chip === chip)?.recommendation;
    if (recommendation === 'play_now') {
      return { chip, label, state: 'recommended', verdict: 'Play now' };
    }
    if (recommendation === 'consider_soon') {
      return { chip, label, state: 'recommended', verdict: 'Plan soon' };
    }
    return { chip, label, state: 'available', verdict: 'Available' };
  });
}

/** doubles and blanks that touch the squad, gameweek by gameweek from now */
export function gameweekTimeline(
  summary: Pick<AnalysisSummary, 'currentEvent' | 'chips' | 'squad'>,
  count: number = TIMELINE_GAMEWEEKS,
): GameweekMark[] {
  const squadTeams = summary.squad.squad.map((player) => player.teamId);
  const playersAffected = (teamIds: number[] | undefined) =>
    teamIds ? squadTeams.filter((teamId) => teamIds.includes(teamId)).length : 0;

  return Array.from({ length: count }, (_, offset) => {
    const event = summary.currentEvent + offset;
    return {
      event,
      doublePlayers: playersAffected(
        summary.chips.doubleGameweeks.find((gw) => gw.event === event)?.teamIds,
      ),
      blankPlayers: playersAffected(
        summary.chips.blankGameweeks.find((gw) => gw.event === event)?.teamIds,
      ),
    };
  });
}

export function priceRows(
  alerts: AnalysisSummary['priceAlerts']['alerts'],
): PriceRow[] {
  return alerts.map(({ player, direction, status }) => ({
    id: player.id,
    name: player.webName,
    price: formatPrice(player.nowCost),
    direction,
    note:
      status === 'changed_today'
        ? direction === 'rise'
          ? 'rose today'
          : 'fell today'
        : direction === 'rise'
          ? 'likely to rise'
          : 'likely to fall',
  }));
}
