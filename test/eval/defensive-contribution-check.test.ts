import { describe, expect, it } from 'vitest';
import {
  callsByBand,
  constantBrier,
  defensiveContributionCalls,
  summariseCalls,
} from '../../lib/eval/defensive-contribution-check.js';
import type { DefensiveContributionCall } from '../../lib/eval/defensive-contribution-check.js';
import { buildGameweekCases } from '../../lib/eval/snapshot.js';
import type { SeasonRows } from '../../lib/eval/snapshot.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

function call(chance: number, reached: boolean): DefensiveContributionCall {
  return { gameweek: 1, position: 'DEF', minutes: 90, chance, reached };
}

describe('defensiveContributionCalls', () => {
  it('checks each appearance of a player who can earn them, against the count he reached', () => {
    const row = (season: string, gameweek: number, overrides = {}) =>
      makeRow({
        season,
        gameweek,
        position: 'DEF',
        defensiveContribution: 11,
        ...overrides,
      });
    const seasons: SeasonRows[] = [
      {
        season: '2025-26',
        rows: [1, 2, 3].map((gameweek) => row('2025-26', gameweek)),
      },
      {
        season: '2026-27',
        rows: [
          row('2026-27', 1),
          row('2026-27', 2, { defensiveContribution: 4 }),
          // didn't play: not an appearance to check
          row('2026-27', 3, { minutes: 0, starts: 0, defensiveContribution: 0 }),
        ],
      },
    ];

    const calls = defensiveContributionCalls(
      buildGameweekCases(seasons, '2026-27'),
      seasons[1]?.rows ?? [],
    );

    expect(calls.map((entry) => entry.reached)).toEqual([true, false]);
    expect(calls.every((entry) => entry.chance > 0 && entry.chance < 1)).toBe(true);
  });

  it('fails loudly on a season without the counts', () => {
    const seasons: SeasonRows[] = [
      { season: '2025-26', rows: [makeRow({ season: '2025-26', position: 'DEF' })] },
      { season: '2026-27', rows: [makeRow({ season: '2026-27', position: 'DEF' })] },
    ];
    expect(() =>
      defensiveContributionCalls(
        buildGameweekCases(seasons, '2026-27'),
        seasons[1]?.rows ?? [],
      ),
    ).toThrow('no defensive contribution counts');
  });
});

describe('summariseCalls and friends', () => {
  it('averages the chance, the hits and the brier score, and bands them', () => {
    const calls = [call(0.2, false), call(0.6, true)];

    const summary = summariseCalls(calls);
    expect(summary.appearances).toBe(2);
    expect(summary.predicted).toBeCloseTo(0.4);
    expect(summary.actual).toBeCloseTo(0.5);
    expect(summary.brier).toBeCloseTo((0.04 + 0.16) / 2);
    expect(constantBrier(calls, () => 0.5)).toBeCloseTo(0.25);
    expect(callsByBand(calls).map((band) => band.summary.appearances)).toEqual([
      0, 1, 0, 1, 0,
    ]);
    expect(summariseCalls([]).appearances).toBe(0);
  });
});
