import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { AnalysisPlayer } from '../lib/analysis/types.js';
import {
  captainPicks,
  chipStamps,
  formatGain,
  formatPrice,
  priceRows,
  transferMoves,
} from '../web/report-view.js';

const EVENT = 12;

let nextId = 1;
function player(
  webName: string,
  overrides: Partial<AnalysisPlayer> = {},
): AnalysisPlayer {
  return {
    id: nextId++,
    webName,
    teamId: 1,
    teamShortName: 'TST',
    position: 'MID',
    nowCost: 80,
    form: 5,
    epNext: 5,
    totalPoints: 50,
    selectedByPercent: 10,
    chanceOfPlayingNextRound: null,
    costChangeEvent: 0,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    nextFixtures: [
      { event: EVENT, opponentShortName: 'LIV', isHome: true, difficulty: 3 },
    ],
    ...overrides,
  };
}

function suggestion(outName: string, inName: string | null, gain: number) {
  return {
    outPlayer: player(outName),
    reasonCodes: [],
    inCandidates: inName ? [player(inName)] : [],
    expectedPointsGain: gain,
  };
}

type Transfers = AnalysisSummary['transfers'];

describe('transferMoves', () => {
  const suggestions = [
    suggestion('Watkins', 'Isak', 3.2),
    suggestion('Mitoma', 'Saka', 2.1),
    suggestion('Gordon', 'Palmer', 1.4),
  ];

  it('keeps only the recommended moves, spending free transfers first', () => {
    const transfers: Transfers = {
      suggestions,
      recommendedCount: 2,
      freeTransfers: 1,
      pointsHitCost: 4,
      projectedNetGain: 1.3,
    };
    expect(transferMoves(transfers)).toEqual([
      { outName: 'Watkins', inName: 'Isak', gain: 3.2, cost: 'free' },
      { outName: 'Mitoma', inName: 'Saka', gain: 2.1, cost: 'hit' },
    ]);
  });

  it('returns nothing when no move is worth making', () => {
    const transfers: Transfers = {
      suggestions,
      recommendedCount: 0,
      freeTransfers: 1,
      pointsHitCost: 0,
      projectedNetGain: 0,
    };
    expect(transferMoves(transfers)).toEqual([]);
  });

  it('marks a move with no affordable replacement', () => {
    const transfers: Transfers = {
      suggestions: [suggestion('Watkins', null, 0)],
      recommendedCount: 1,
      freeTransfers: 2,
      pointsHitCost: 0,
      projectedNetGain: 0,
    };
    expect(transferMoves(transfers)[0]?.inName).toBeNull();
  });
});

describe('captainPicks', () => {
  it('gives the captain and vice with fixture, form and expected points', () => {
    const salah = player('Salah', {
      form: 8.25,
      epNext: 7.1,
      nextFixtures: [
        { event: EVENT, opponentShortName: 'WHU', isHome: false, difficulty: 2 },
      ],
    });
    const picks = captainPicks(
      {
        captain: { player: salah, score: 9 },
        viceCaptain: { player: player('Haaland'), score: 8 },
        candidates: [],
      },
      EVENT,
    );
    expect(picks).toEqual([
      {
        role: 'captain',
        name: 'Salah',
        reason: 'WHU (A) · form 8.3 · 7.1 expected pts',
      },
      {
        role: 'vice',
        name: 'Haaland',
        reason: 'LIV (H) · form 5.0 · 5.0 expected pts',
      },
    ]);
  });

  it('notes a blank gameweek and skips a missing vice', () => {
    const blank = player('Mbeumo', { nextFixtures: [] });
    const picks = captainPicks(
      { captain: { player: blank, score: 1 }, viceCaptain: null, candidates: [] },
      EVENT,
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]?.reason).toMatch(/^Blank/);
  });

  it('returns nothing without a captain', () => {
    expect(
      captainPicks({ captain: null, viceCaptain: null, candidates: [] }, EVENT),
    ).toEqual([]);
  });
});

describe('chipStamps', () => {
  it('lists all four chips in a fixed order with their state', () => {
    const stamps = chipStamps(
      ['wildcard'],
      [
        { chip: 'bench_boost', recommendation: 'play_now', reasonCodes: [] },
        { chip: 'triple_captain', recommendation: 'consider_soon', reasonCodes: [] },
        { chip: 'free_hit', recommendation: 'hold', reasonCodes: [] },
      ],
    );
    expect(stamps.map((s) => [s.chip, s.state, s.verdict])).toEqual([
      ['wildcard', 'used', 'Used'],
      ['free_hit', 'available', 'Available'],
      ['bench_boost', 'recommended', 'Play now'],
      ['triple_captain', 'recommended', 'Plan soon'],
    ]);
  });

  it('treats a chip with no suggestion and no use as available', () => {
    expect(chipStamps([], []).every((s) => s.state === 'available')).toBe(true);
  });
});

describe('priceRows', () => {
  it('describes confirmed and predicted moves in both directions', () => {
    const rows = priceRows([
      {
        player: player('Salah', { nowCost: 131 }),
        direction: 'rise',
        status: 'predicted',
      },
      {
        player: player('Watkins', { nowCost: 90 }),
        direction: 'fall',
        status: 'changed_today',
      },
    ]);
    expect(rows.map((r) => [r.name, r.price, r.direction, r.note])).toEqual([
      ['Salah', '£13.1m', 'rise', 'likely to rise'],
      ['Watkins', '£9.0m', 'fall', 'fell today'],
    ]);
  });

  it('returns nothing when there are no alerts', () => {
    expect(priceRows([])).toEqual([]);
  });
});

describe('formatting', () => {
  it('signs point gains and keeps one decimal', () => {
    expect(formatGain(3.24)).toBe('+3.2 pts');
    expect(formatGain(0)).toBe('+0.0 pts');
    expect(formatGain(-1.5)).toBe('-1.5 pts');
  });

  it('formats fpl tenths as millions', () => {
    expect(formatPrice(55)).toBe('£5.5m');
  });
});
