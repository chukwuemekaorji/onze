import { describe, expect, it, vi } from 'vitest';
import type { GameweekResult } from '../../lib/eval/backtest.js';
import type { Projector } from '../../lib/eval/baselines.js';
import { haulParts } from '../../lib/eval/compare.js';
import type { Difference } from '../../lib/eval/compare.js';
import {
  bestBlendWeight,
  bestBlendWeightsByPosition,
  blendProjector,
  decide,
  decisionDifferences,
  memoised,
  readDifference,
  routeGameweeks,
  routeHauls,
} from '../../lib/eval/ensemble.js';
import type { BlendExample } from '../../lib/eval/ensemble.js';
import { scoreGameweek } from '../../lib/eval/metrics.js';
import type { HistoryView, PlayerTarget } from '../../lib/eval/snapshot.js';

const OPTIONS = { resamples: 200, seed: 1, level: 0.95 };

function example(twoPart: number, event: number, actual: number): BlendExample {
  return { position: 'MID', twoPart, event, actual };
}

function constant(id: string, value: number | null): Projector {
  return { id, label: id, describe: id, project: () => value };
}

const target = {
  season: '2024-25',
  gameweek: 3,
  playerId: 7,
  position: 'DEF',
} as PlayerTarget;
const history = {} as HistoryView;

function result(
  gameweek: number,
  projected: number[],
  actual: number[],
): GameweekResult {
  return {
    season: '2024-25',
    gameweek,
    players: projected.length,
    parts: scoreGameweek(
      projected.map((value, index) => ({
        position: 'MID',
        projected: value,
        actual: actual[index] ?? 0,
        minutes: 90,
      })),
    ),
  };
}

describe('bestBlendWeight', () => {
  it('recovers the weight that made the actuals', () => {
    const pairs = [
      [4, 1],
      [2, 6],
      [7, 3],
      [0, 2],
    ] as const;
    const examples = pairs.map(([a, b]) => example(a, b, 0.3 * a + 0.7 * b));

    expect(bestBlendWeight(examples)).toBeCloseTo(0.3, 10);
  });

  it('stays within 0 and 1 when the data would bet against a model', () => {
    // actual runs past the two-part model, away from the event model
    expect(bestBlendWeight([example(2, 0, 4), example(4, 0, 8)])).toBe(1);
    expect(bestBlendWeight([example(2, 0, -2), example(4, 0, -4)])).toBe(0);
  });

  it('keeps the two-part model when both models agree everywhere', () => {
    expect(bestBlendWeight([example(3, 3, 5), example(1, 1, 0)])).toBe(1);
  });

  it('rejects an empty training set', () => {
    expect(() => bestBlendWeight([])).toThrow('no examples');
  });
});

describe('bestBlendWeightsByPosition', () => {
  it('fits each position on its own players', () => {
    const examples: BlendExample[] = [
      { position: 'GK', twoPart: 4, event: 0, actual: 4 },
      { position: 'DEF', twoPart: 4, event: 0, actual: 0 },
      { position: 'MID', twoPart: 4, event: 0, actual: 2 },
      { position: 'FWD', twoPart: 4, event: 0, actual: 1 },
    ];

    expect(bestBlendWeightsByPosition(examples)).toEqual({
      GK: 1,
      DEF: 0,
      MID: 0.5,
      FWD: 0.25,
    });
  });

  it('throws when a position has no players, rather than inventing a weight', () => {
    expect(() => bestBlendWeightsByPosition([example(1, 2, 3)])).toThrow('no examples');
  });
});

describe('blendProjector', () => {
  it("mixes the two models by the target's position weight", () => {
    const blend = blendProjector(
      constant('a', 4),
      constant('b', 2),
      (position) => (position === 'DEF' ? 0.25 : 1),
      'blend',
    );

    expect(blend.project(target, history)).toBeCloseTo(2.5);
  });

  it('has nothing to say when either model has nothing to say', () => {
    const blend = blendProjector(constant('a', 4), constant('b', null), () => 0.5, 'x');

    expect(blend.project(target, history)).toBeNull();
  });
});

describe('memoised', () => {
  it('asks the model once per player-gameweek', () => {
    const project = vi.fn(() => 3);
    const cached = memoised({ id: 'm', label: 'm', describe: 'm', project });

    cached.project(target, history);
    cached.project(target, history);
    cached.project({ ...target, gameweek: 4 }, history);

    expect(project).toHaveBeenCalledTimes(2);
  });
});

describe('routing', () => {
  it("takes the shortlist measures from one run and the captain's from the other", () => {
    // the shortlist run captains the 0-pointer; the captaincy run the 9
    const shortlist = [result(1, [3, 2, 1], [0, 9, 4])];
    const captaincy = [result(1, [1, 3, 2], [0, 9, 4])];
    const [routed] = routeGameweeks(shortlist, captaincy);

    expect(routed?.parts.topFive).toEqual(shortlist[0]?.parts.topFive);
    expect(routed?.parts.captainRegret).toEqual(captaincy[0]?.parts.captainRegret);
  });

  it('routes the haul measures the same way', () => {
    const projection = (playerId: number, projected: number, actual: number) => ({
      season: '2024-25',
      gameweek: 1,
      playerId,
      projected,
      actual,
      minutes: 90,
    });
    const shortlist = haulParts([projection(1, 3, 0), projection(2, 1, 12)]);
    const captaincy = haulParts([projection(1, 1, 0), projection(2, 3, 12)]);
    const [routed] = routeHauls(shortlist, captaincy);

    expect(routed?.parts.haulsShortlisted).toEqual(
      shortlist[0]?.parts.haulsShortlisted,
    );
    expect(routed?.parts.captainPoints).toEqual({ sum: 12, count: 1 });
  });

  it('rejects runs that scored different gameweeks', () => {
    expect(() => routeGameweeks([result(1, [1], [1])], [result(2, [1], [1])])).toThrow(
      'same gameweeks',
    );
  });
});

describe('decisionDifferences', () => {
  it('is exactly 0 on every measure for a run against itself', () => {
    const gameweeks = [1, 2, 3].map((gameweek) =>
      result(gameweek, [3, 2, 1], [1, 12, 0]),
    );
    const hauls = haulParts(
      [1, 2, 3].flatMap((gameweek) => [
        {
          season: '2024-25',
          gameweek,
          playerId: 1,
          projected: 3,
          actual: 1,
          minutes: 90,
        },
        {
          season: '2024-25',
          gameweek,
          playerId: 2,
          projected: 2,
          actual: 12,
          minutes: 90,
        },
      ]),
    );
    const run = { gameweeks, hauls };
    const differences = decisionDifferences(run, run, OPTIONS);

    expect(differences.topFive.value).toBe(0);
    expect(differences.haulsShortlisted.value).toBe(0);
    expect(differences.captainRegret.interval).toEqual({ low: 0, high: 0 });
  });
});

function difference(low: number, high: number): Difference {
  return { value: (low + high) / 2, interval: { low, high } };
}

describe('readDifference', () => {
  it('reads an interval clear of 0 by which way is better', () => {
    expect(readDifference(difference(0.1, 0.5), 'higher')).toBe('better');
    expect(readDifference(difference(0.1, 0.5), 'lower')).toBe('worse');
    expect(readDifference(difference(-0.5, -0.1), 'lower')).toBe('better');
  });

  it('is unclear when the interval spans or touches 0, or is missing', () => {
    expect(readDifference(difference(-0.1, 0.5), 'higher')).toBe('unclear');
    expect(readDifference(difference(0, 0), 'higher')).toBe('unclear');
    expect(readDifference({ value: null, interval: null }, 'higher')).toBe('unclear');
  });
});

describe('decide', () => {
  const unclear = difference(-1, 1);

  it('ships on one clear win with no clear loss', () => {
    const decision = decide({
      topFive: difference(0.1, 0.4),
      haulsShortlisted: unclear,
      captainRegret: unclear,
    });

    expect(decision.ship).toBe(true);
    expect(decision.readings.topFive).toBe('better');
  });

  it('does not ship a win that comes with a clear loss', () => {
    const decision = decide({
      topFive: difference(0.1, 0.4),
      haulsShortlisted: unclear,
      // regret is lower-is-better, so a positive interval is a loss
      captainRegret: difference(0.2, 1.5),
    });

    expect(decision.ship).toBe(false);
    expect(decision.readings.captainRegret).toBe('worse');
  });

  it('does not ship when nothing is clear', () => {
    expect(
      decide({ topFive: unclear, haulsShortlisted: unclear, captainRegret: unclear })
        .ship,
    ).toBe(false);
  });
});
