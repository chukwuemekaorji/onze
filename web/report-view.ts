import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { ChipName } from '../lib/analysis/chips.js';
import type { PriceDirection } from '../lib/analysis/price-alerts.js';
import { POINTS_PER_HIT } from '../lib/analysis/transfers.js';
import { fixtureLabel } from './pitch-layout.js';

/** card-ready shapes for the report column, worked out from the analysis summary */

export type TransferCost = 'free' | 'hit';

export interface TransferMove {
  outName: string;
  /** null when nothing affordable beats the outgoing player */
  inName: string | null;
  /** expected points gained before any hit */
  gain: number;
  cost: TransferCost;
}

export interface CaptainPick {
  role: 'captain' | 'vice';
  name: string;
  reason: string;
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

export const HIT_LABEL = `-${POINTS_PER_HIT}`;

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

/** the recommended moves only; free transfers are spent first, then hits */
export function transferMoves(transfers: AnalysisSummary['transfers']): TransferMove[] {
  return transfers.suggestions
    .slice(0, transfers.recommendedCount)
    .map((suggestion, index) => ({
      outName: suggestion.outPlayer.webName,
      inName: suggestion.inCandidates[0]?.webName ?? null,
      gain: suggestion.expectedPointsGain,
      cost: index < transfers.freeTransfers ? 'free' : 'hit',
    }));
}

export function captainPicks(
  captaincy: AnalysisSummary['captaincy'],
  event: number,
): CaptainPick[] {
  const picks: CaptainPick[] = [];
  const roles = [
    ['captain', captaincy.captain],
    ['vice', captaincy.viceCaptain],
  ] as const;
  for (const [role, candidate] of roles) {
    if (!candidate) continue;
    const { player } = candidate;
    picks.push({
      role,
      name: player.webName,
      reason: [
        fixtureLabel(player.nextFixtures, event),
        `form ${player.form.toFixed(1)}`,
        `${player.epNext.toFixed(1)} expected pts`,
      ].join(' · '),
    });
  }
  return picks;
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
