import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { ChipName } from '../lib/analysis/chips.js';
import type { PriceAlertStatus, PriceDirection } from '../lib/analysis/price-alerts.js';
import type { AnalysisPlayer } from '../lib/analysis/types.js';
import { HIT_SAFETY_MARGIN, POINTS_PER_HIT } from '../lib/analysis/transfers.js';
import {
  captainSentence,
  cardLine,
  exactNumbers,
  planReasonSentence,
  planWeekHeadline,
  transferSentence,
} from '../lib/plain-labels.js';
import { fixtureLabel } from './pitch-layout.js';

/** card-ready shapes for the binder pages, worked out from the analysis summary */

/** free and hit moves are recommended; skip means weighed and left alone */
export type TransferVerdict = 'free' | 'hit' | 'skip';

/** one player's plain card: the line shown, and the exact numbers behind it on tap */
export interface PlayerCard {
  name: string;
  /** "onze predicts 5.4 pts · Nailed on · High goal threat · Easy fixture" */
  line: string;
  exact: string[];
}

export interface TransferRow {
  outName: string;
  /** the incoming player's id, for replaying the swap on the pitch */
  inId: number | null;
  /** null when nothing affordable beats the outgoing player */
  inName: string | null;
  /** how many more points onze predicts for the gameweek, before any hit */
  gain: number;
  verdict: TransferVerdict;
  /** the other replacements, best first, with prices */
  alternatives: string[];
  /** "onze thinks Gabriel will score about 3 more points than Dasilva this week." */
  sentence: string | null;
  /** the incoming player's card, null with no replacement */
  incoming: PlayerCard | null;
}

export interface CaptainOption {
  rank: number;
  id: number;
  name: string;
  fixture: string;
  /** onze's predicted points for the gameweek */
  predicted: number;
  card: PlayerCard;
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

export type LeagueMovement = 'up' | 'down' | 'same' | 'new';

export interface LeagueRow {
  id: number;
  name: string;
  /** "3rd of 12", or a note when fpl hasn't ranked the league yet */
  position: string;
  movement: LeagueMovement;
  /** places gained or lost since last gameweek; 0 when same or new */
  places: number;
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

export function playerCard(player: AnalysisPlayer, event: number): PlayerCard {
  return {
    name: player.webName,
    line: cardLine(player, event),
    exact: exactNumbers(player),
  };
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
export function transferRows(
  transfers: AnalysisSummary['transfers'],
  event: number,
): TransferRow[] {
  return transfers.suggestions.map((suggestion, index) => {
    const [best, ...others] = suggestion.inCandidates;
    const verdict: TransferVerdict =
      index >= transfers.recommendedCount
        ? 'skip'
        : index < transfers.freeTransfers
          ? 'free'
          : 'hit';
    const out = suggestion.outPlayer;
    return {
      outName: out.webName,
      inId: best?.id ?? null,
      inName: best?.webName ?? null,
      gain: suggestion.expectedPointsGain,
      verdict,
      alternatives: others.map((p) => `${p.webName} ${formatPrice(p.nowCost)}`),
      sentence: best
        ? transferSentence(best, out, suggestion.expectedPointsGain)
        : null,
      incoming: best ? playerCard(best, event) : null,
    };
  });
}

/** one plain line on why a hit is or isn't worth taking this week */
export function hitAdvice(
  summary: Pick<AnalysisSummary, 'transfers' | 'leagueStandings' | 'currentEvent'>,
): string {
  const { transfers } = summary;
  const rows = transferRows(transfers, summary.currentEvent);
  const free = plural(transfers.freeTransfers, 'free transfer');

  if (rows.length === 0)
    return 'No weak links worth replacing, so there is no hit to weigh.';

  if (transfers.pointsHitCost > 0) {
    const hit = rows.find((row) => row.verdict === 'hit');
    if (hit) {
      return `The ${HIT_LABEL} is worth it: ${hit.outName} for ${hit.inName ?? 'a replacement'} gains about ${hit.gain.toFixed(1)} points, more than the ${POINTS_PER_HIT} it costs plus a ${HIT_SAFETY_MARGIN}-point safety margin.`;
    }
  }

  const next = rows.find((row) => row.verdict === 'skip');
  if (!next) return `Your ${free} cover every move worth making, so no hit is needed.`;

  const leadingALeague = summary.leagueStandings.some((league) => league.rank === 1);
  if (next.gain > HIT_THRESHOLD && leadingALeague) {
    return `${next.outName} for ${next.inName ?? 'a replacement'} would gain about ${next.gain.toFixed(1)} points, but you lead a league, so onze skips hits to protect it.`;
  }
  // a swap onze predicts no gain for needs no maths about margins
  if (next.gain <= 0) {
    return `No other swap would gain you points this week, so a ${HIT_LABEL} isn't worth it.`;
  }
  return `A ${HIT_LABEL} for ${next.outName} isn't worth it: the swap gains about ${next.gain.toFixed(1)} points, short of the ${HIT_THRESHOLD} needed to beat the hit with a margin.`;
}

/** the top captain options, best first, with the chosen c and v marked */
export function captainOptions(
  captaincy: AnalysisSummary['captaincy'],
  event: number,
  limit: number = CAPTAIN_OPTION_COUNT,
): CaptainOption[] {
  const captainId = captaincy.captain?.player.id;
  const viceId = captaincy.viceCaptain?.player.id;
  return captaincy.candidates.slice(0, limit).map(({ player }, index) => {
    return {
      rank: index + 1,
      id: player.id,
      name: player.webName,
      fixture: fixtureLabel(player.nextFixtures, event),
      predicted: player.projection.points,
      card: playerCard(player, event),
      role: player.id === captainId ? 'captain' : player.id === viceId ? 'vice' : null,
    };
  });
}

/** "Captain Haaland: onze predicts 7.3 pts, the highest in your team.", or null */
export function captainHeadline(
  summary: Pick<AnalysisSummary, 'captaincy' | 'lineup'>,
): string | null {
  const captain = summary.captaincy.captain?.player;
  if (captain === undefined) return null;
  const squad = [
    ...summary.lineup.startingXI.map(({ player }) => player),
    ...summary.lineup.bench.map(({ player }) => player),
  ];
  return captainSentence(captain, squad);
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
      return { chip, label, state: 'recommended', verdict: 'Play this week' };
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

const COUNT_FORMAT = new Intl.NumberFormat('en-GB');

function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * every mini-league with its position and movement since last gameweek. fpl
 * gives 0 for a rank it hasn't worked out yet, as in a league's first week
 */
export function leagueRows(standings: AnalysisSummary['leagueStandings']): LeagueRow[] {
  return standings.map((league) => {
    const ranked = league.rank > 0;
    const position = ranked
      ? `${ordinal(league.rank)} of ${COUNT_FORMAT.format(league.totalEntries)}`
      : 'not ranked yet';
    const change = league.previousRank - league.rank;
    const movement: LeagueMovement =
      !ranked || league.previousRank <= 0
        ? 'new'
        : change > 0
          ? 'up'
          : change < 0
            ? 'down'
            : 'same';
    return {
      id: league.id,
      name: league.name,
      position,
      movement,
      places: movement === 'up' || movement === 'down' ? Math.abs(change) : 0,
    };
  });
}

// every note says "this gameweek": fpl's figures cover the whole gameweek, not today
const PRICE_NOTE: Record<PriceAlertStatus, Record<PriceDirection, string>> = {
  changed_this_gameweek: { rise: 'rose this gameweek', fall: 'fell this gameweek' },
  demand_this_gameweek: {
    rise: 'heavily bought this gameweek',
    fall: 'heavily sold this gameweek',
  },
};

export function priceRows(
  alerts: AnalysisSummary['priceAlerts']['alerts'],
): PriceRow[] {
  return alerts.map(({ player, direction, status }) => ({
    id: player.id,
    name: player.webName,
    price: formatPrice(player.nowCost),
    direction,
    note: PRICE_NOTE[status][direction],
  }));
}

/** one week of the transfer plan, ready for the timeline */
export interface PlanRow {
  event: number;
  /** "GW12: Dasilva → Gabriel (free)" */
  headline: string;
  /** "Arsenal's easy run starts in GW14." */
  reason: string;
  /** a week with a -4 in it, so the row can stand out */
  hasHit: boolean;
}

export function planRows(plan: AnalysisSummary['plan']): PlanRow[] {
  return plan.weeks.map((week) => ({
    event: week.event,
    headline: planWeekHeadline(week),
    reason: planReasonSentence(week.reason),
    hasHit: week.hits > 0,
  }));
}
