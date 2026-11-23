import { describe, expect, it } from 'vitest';
import type { AnalysisPlayer, Position } from '../../lib/analysis/types.js';
import {
  pairedDifference,
  plannerShips,
  readDifference,
} from '../../lib/backtest/compare.js';
import { STARTING_BUDGET } from '../../lib/backtest/fpl-rules.js';
import { POLICIES } from '../../lib/backtest/policies.js';
import type { Policy } from '../../lib/backtest/policies.js';
import {
  buildSeasonData,
  clubAt,
  fixturesOf,
  isInGame,
  outcomeOf,
  priceAt,
} from '../../lib/backtest/season-data.js';
import { simulateSeason } from '../../lib/backtest/simulate.js';
import type { SeasonRun } from '../../lib/backtest/simulate.js';
import { buildStartSquads, greedySquad } from '../../lib/backtest/start-squads.js';
import type { SquadCandidate } from '../../lib/backtest/start-squads.js';
import { makePlayer, makeProjection } from '../helpers/fixtures.js';
import { makeRow } from '../helpers/player-gameweek-row.js';

const OPTIONS = { resamples: 500, seed: 1, level: 0.95 };

describe('buildSeasonData', () => {
  const rows = [
    makeRow({ playerId: 1, gameweek: 1, nowCost: 50, totalPoints: 6 }),
    // gameweek 2 is a double: two fixtures, points and minutes summed
    makeRow({ playerId: 1, gameweek: 2, fixtureId: 201, nowCost: 51, totalPoints: 3 }),
    makeRow({
      playerId: 1,
      gameweek: 2,
      fixtureId: 202,
      nowCost: 51,
      totalPoints: 4,
      kickoffTime: '2024-08-28T19:00:00Z',
    }),
    // gameweek 3 is a blank for his club; he's back in gameweek 4 at a new club
    makeRow({ playerId: 1, gameweek: 4, nowCost: 52, teamId: 7, teamName: 'Chelsea' }),
    makeRow({ playerId: 2, gameweek: 3, nowCost: 45, teamId: 2, teamName: 'Spurs' }),
  ];
  const data = buildSeasonData('2024-25', rows);
  const one = data.players.get(1);
  const two = data.players.get(2);
  if (one === undefined || two === undefined) throw new Error('players missing');

  it('sums a double gameweek and lists both fixtures', () => {
    expect(outcomeOf(data, 2, 1)).toEqual({ points: 7, minutes: 180 });
    expect(fixturesOf(data, 'Arsenal', 2)).toHaveLength(2);
  });

  it('keeps the last price and club through a blank, and follows a move', () => {
    expect(priceAt(one, 3)).toBe(51);
    expect(outcomeOf(data, 3, 1)).toEqual({ points: 0, minutes: 0 });
    expect(isInGame(one, 3)).toBe(true);
    expect(clubAt(one, 4)).toEqual({ teamId: 7, teamName: 'Chelsea' });
  });

  it('has a player in the game only from his first row to his last', () => {
    expect(isInGame(two, 2)).toBe(false);
    expect(isInGame(two, 3)).toBe(true);
    expect(isInGame(two, 4)).toBe(false);
  });

  it('refuses a row from another season', () => {
    expect(() => buildSeasonData('2023-24', rows)).toThrow('a 2024-25 row in 2023-24');
  });
});

const SHAPE: Position[] = [
  'GK',
  'GK',
  ...Array<Position>(5).fill('DEF'),
  ...Array<Position>(5).fill('MID'),
  ...Array<Position>(3).fill('FWD'),
];

/** three of each position per price band, one club each, enough for many squads */
function candidates(): SquadCandidate[] {
  const list: SquadCandidate[] = [];
  let id = 1;
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    for (const price of [40, 55, 70, 90, 120]) {
      for (let copy = 0; copy < 3; copy += 1) {
        list.push({
          id,
          position,
          teamId: id,
          price,
          // dearer players scored more last season, with a little spread
          lastSeasonPoints: price * 2 + copy * 7,
        });
        id += 1;
      }
    }
  }
  return list;
}

describe('start squads', () => {
  it('builds legal £100m squads in fpl shape', () => {
    for (const squad of buildStartSquads(candidates(), 5, 7)) {
      const spent = squad.players.reduce(
        (sum, player) => sum + player.purchasePrice,
        0,
      );
      expect(spent + squad.bank).toBe(STARTING_BUDGET);
      expect(squad.bank).toBeGreaterThanOrEqual(0);
      expect(squad.players.map((player) => player.position).sort()).toEqual(
        [...SHAPE].sort(),
      );
    }
  });

  it('makes the first squad the plain best guess and varies the rest, the same every time', () => {
    const squads = buildStartSquads(candidates(), 4, 7);
    const best = greedySquad(candidates(), (candidate) => candidate.lastSeasonPoints);
    const ids = (players: { id: number }[]) =>
      players.map((player) => player.id).sort();
    expect(ids(squads[0]?.players ?? [])).toEqual(ids(best.players));
    expect(
      new Set(squads.map((squad) => ids(squad.players).join(','))).size,
    ).toBeGreaterThan(1);
    expect(buildStartSquads(candidates(), 4, 7)).toEqual(squads);
  });

  it('respects three per club', () => {
    // the six dearest, best-scoring midfielders all play for club 1
    const crowded = candidates().map((candidate) =>
      candidate.position === 'MID' && candidate.price >= 90
        ? { ...candidate, teamId: 1 }
        : candidate,
    );
    const squad = greedySquad(crowded, (candidate) => candidate.lastSeasonPoints);
    expect(
      squad.players.filter((player) => player.teamId === 1).length,
    ).toBeLessThanOrEqual(3);
  });

  it('fails loudly when no legal squad exists', () => {
    const tooDear = candidates().map((candidate) => ({ ...candidate, price: 200 }));
    expect(() => buildStartSquads(tooDear, 1, 7)).toThrow();
    expect(() => buildStartSquads(candidates(), 0, 7)).toThrow('at least one');
  });
});

function run(
  season: string,
  squadNumber: number,
  weekly: number[],
  hitCost = 0,
): SeasonRun {
  const weeks = weekly.map((points, index) => ({
    gameweek: index + 1,
    points,
    hitCost: index === 0 ? hitCost : 0,
    hits: index === 0 ? hitCost / 4 : 0,
    transfers: 0,
  }));
  return {
    season,
    squadNumber,
    policyId: 'onze-planner',
    weeks,
    total: weeks.reduce((sum, week) => sum + week.points - week.hitCost, 0),
    transfers: 0,
    hits: 0,
  };
}

describe('pairedDifference', () => {
  it('is the season gap per squad, seasons averaged, exact when every week agrees', () => {
    const a = [run('2023-24', 1, [5, 5, 5]), run('2024-25', 1, [5, 5, 5])];
    const b = [run('2023-24', 1, [4, 4, 4]), run('2024-25', 1, [3, 3, 3])];
    const difference = pairedDifference(a, b, OPTIONS);
    // 3 a season in one, 6 in the other
    expect(difference.value).toBeCloseTo(4.5);
    expect(difference.bySeason.map((entry) => entry.value)).toEqual([3, 6]);
    expect(difference.bySeason[0]?.interval).toEqual({ low: 3, high: 3 });
    expect(readDifference(difference)).toBe('better');
  });

  it('counts hits against a policy', () => {
    const a = [run('2023-24', 1, [5, 5], 4)];
    const b = [run('2023-24', 1, [5, 5])];
    expect(pairedDifference(a, b, OPTIONS).value).toBe(-4);
  });

  it('refuses runs that are not paired', () => {
    expect(() =>
      pairedDifference([run('2023-24', 1, [5])], [run('2023-24', 2, [5])], OPTIONS),
    ).toThrow('no paired run');
  });
});

describe('plannerShips', () => {
  it('ships unless the interval lies wholly below 0', () => {
    expect(plannerShips({ interval: { low: -5, high: 2 } })).toBe(true);
    expect(plannerShips({ interval: { low: 1, high: 2 } })).toBe(true);
    expect(plannerShips({ interval: { low: -5, high: -0.1 } })).toBe(false);
  });
});

describe('simulateSeason', () => {
  // fifteen players, one club each, everyone plays 90 minutes for 2 points a
  // week for three weeks, prices flat; players 16 and 17 are on the market
  const POSITIONS: Position[] = [...SHAPE, 'DEF', 'MID'];
  const rows = POSITIONS.flatMap((position, index) =>
    [1, 2, 3].map((gameweek) =>
      makeRow({
        playerId: index + 1,
        position,
        teamId: index + 1,
        teamName: `Club ${index + 1}`,
        gameweek,
        fixtureId: gameweek * 100 + index,
        nowCost: 50,
        totalPoints: 2,
      }),
    ),
  );
  const data = buildSeasonData('2024-25', rows);
  const start = {
    players: SHAPE.map((position, index) => ({
      id: index + 1,
      position,
      teamId: index + 1,
      purchasePrice: 50,
    })),
    bank: STARTING_BUDGET - 15 * 50,
  };
  // the model view: the first forward predicted highest, so he's captain
  const view = new Map<number, AnalysisPlayer>(
    POSITIONS.map((position, index) => {
      const id = index + 1;
      const points = id === 13 ? 6 : 2;
      return [
        id,
        makePlayer({
          id,
          position,
          teamId: id,
          nowCost: 50,
          projection: makeProjection({
            points,
            weeklyPoints: [points, points, points, points, points],
          }),
        }),
      ];
    }),
  );
  const viewAt = (gameweek: number) =>
    new Map(
      [...view].map(([id, player]) => [
        id,
        { ...player, projection: { ...player.projection, event: gameweek } },
      ]),
    );

  it('scores the eleven with the captain doubled, week after week', () => {
    const noTransfers = POLICIES.find((policy) => policy.id === 'no-transfers');
    if (noTransfers === undefined) throw new Error('policy missing');
    const result = simulateSeason(data, start, 1, noTransfers, viewAt);
    // eleven at 2, the captain's 2 again
    expect(result.weeks.map((week) => week.points)).toEqual([24, 24, 24]);
    expect(result.total).toBe(72);
    expect(result.transfers).toBe(0);
  });

  it('makes no transfers in gameweek 1, then charges a hit beyond the free one', () => {
    const twoSwaps: Policy = {
      id: 'onze-one-week',
      label: 'two swaps',
      view: 'model',
      chooseSwaps: (squad) =>
        squad.currentEvent === 2
          ? [
              { outId: 3, inId: 16 },
              { outId: 8, inId: 17 },
            ]
          : [],
    };
    const result = simulateSeason(data, start, 1, twoSwaps, viewAt);
    expect(result.weeks.map((week) => [week.transfers, week.hitCost])).toEqual([
      [0, 0],
      [2, 4],
      [0, 0],
    ]);
    expect(result.total).toBe(72 - 4);
    expect(result.hits).toBe(1);
  });
});
