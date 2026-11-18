import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { ChipName } from '../lib/analysis/chips.js';
import type { PriceAlertStatus, PriceDirection } from '../lib/analysis/price-alerts.js';
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
  form: number;
  pointsPerGame: number;
  /** fpl's next-gameweek figure, only when it says something form doesn't */
  projected: number | null;
  /** e.g. "form 11.0 · 6.0 per game", plus the projection when it differs */
  reason: string;
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

/** the top captain options, best first, with the chosen c and v marked */
export function captainOptions(
  captaincy: AnalysisSummary['captaincy'],
  event: number,
  limit: number = CAPTAIN_OPTION_COUNT,
): CaptainOption[] {
  const captainId = captaincy.captain?.player.id;
  const viceId = captaincy.viceCaptain?.player.id;
  return captaincy.candidates.slice(0, limit).map(({ player }, index) => {
    const projected = projectionIfDifferent(player.form, player.epNext);
    const parts = [
      `form ${formatStat(player.form)}`,
      `${formatStat(player.pointsPerGame)} per game`,
    ];
    if (projected !== null) parts.push(`${formatStat(projected)} projected`);
    return {
      rank: index + 1,
      id: player.id,
      name: player.webName,
      fixture: fixtureLabel(player.nextFixtures, event),
      form: player.form,
      pointsPerGame: player.pointsPerGame,
      projected,
      reason: parts.join(' · '),
      role: player.id === captainId ? 'captain' : player.id === viceId ? 'vice' : null,
    };
  });
}

const formatStat = (value: number) => value.toFixed(1);

/**
 * fpl's ep_next is form scaled by availability, so for a fit player it just
 * repeats form. it's only shown when it differs at the precision displayed,
 * which in practice means fpl has priced in a fitness doubt
 */
export function projectionIfDifferent(form: number, epNext: number): number | null {
  return formatStat(form) === formatStat(epNext) ? null : epNext;
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
