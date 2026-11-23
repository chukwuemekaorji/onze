import { describe, expect, it } from 'vitest';
import type { Position } from '../../lib/analysis/types.js';
import {
  makeTransfers,
  scoreGameweek,
  sellingPrice,
} from '../../lib/backtest/fpl-rules.js';
import type { Market, Selection, SquadState } from '../../lib/backtest/fpl-rules.js';

describe('sellingPrice', () => {
  it('pays back half of any rise, rounded down to 0.1m', () => {
    expect(sellingPrice(50, 53)).toBe(51);
    expect(sellingPrice(50, 52)).toBe(51);
    expect(sellingPrice(50, 51)).toBe(50);
    expect(sellingPrice(50, 50)).toBe(50);
  });

  it('passes a fall on in full', () => {
    expect(sellingPrice(50, 47)).toBe(47);
  });

  it('rejects a price that is not whole fpl units', () => {
    expect(() => sellingPrice(50.5, 52)).toThrow('whole');
    expect(() => sellingPrice(0, 52)).toThrow('whole');
  });
});

const SHAPE: Position[] = [
  'GK',
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'MID',
  'MID',
  'FWD',
  'FWD',
  'FWD',
];

/** ids 1 to 15, one club each, bought at 5.0m */
function squad(overrides: Partial<SquadState> = {}): SquadState {
  return {
    players: SHAPE.map((position, index) => ({
      id: index + 1,
      position,
      teamId: index + 1,
      purchasePrice: 50,
    })),
    bank: 0,
    freeTransfers: 1,
    ...overrides,
  };
}

function market(
  prices: Record<number, number> = {},
  clubs: Record<number, number> = {},
): Market {
  const positionOf = (id: number): Position => SHAPE[id - 1] ?? 'MID';
  return {
    price: (id) => prices[id] ?? 50,
    teamId: (id) => clubs[id] ?? id,
    // players 101 and up mirror the shape of 1 to 15, so 103 is a defender
    position: (id) => positionOf(id > 100 ? id - 100 : id),
  };
}

describe('makeTransfers', () => {
  it('uses a free transfer and banks the next week as fpl does', () => {
    const made = makeTransfers(squad(), [{ outId: 3, inId: 103 }], market());
    expect(made.hits).toBe(0);
    expect(made.state.freeTransfers).toBe(1);
    expect(made.state.players.find((player) => player.id === 103)).toMatchObject({
      position: 'DEF',
      purchasePrice: 50,
    });
    expect(makeTransfers(squad(), [], market()).state.freeTransfers).toBe(2);
    expect(
      makeTransfers(squad({ freeTransfers: 5 }), [], market()).state.freeTransfers,
    ).toBe(5);
  });

  it('charges 4 for each transfer beyond the free ones, and leaves 1 after', () => {
    const made = makeTransfers(
      squad(),
      [
        { outId: 3, inId: 103 },
        { outId: 8, inId: 108 },
      ],
      market(),
    );
    expect(made.hits).toBe(1);
    expect(made.hitCost).toBe(4);
    expect(made.state.freeTransfers).toBe(1);
  });

  it('sells at the selling price, not the market price', () => {
    // bought at 5.0m, now 5.4m: sells for 5.2m, so a 5.2m buy fits with 0 in the bank
    const prices = { 3: 54, 103: 52 };
    expect(
      makeTransfers(squad(), [{ outId: 3, inId: 103 }], market(prices)).state.bank,
    ).toBe(0);
    expect(() =>
      makeTransfers(squad(), [{ outId: 3, inId: 103 }], market({ ...prices, 103: 53 })),
    ).toThrow('overspend');
  });

  it('checks the money once, after all of the week', () => {
    // the first swap overspends alone, the second pays for it
    const made = makeTransfers(
      squad({ freeTransfers: 2 }),
      [
        { outId: 3, inId: 103 },
        { outId: 8, inId: 108 },
      ],
      market({ 103: 55, 108: 45 }),
    );
    expect(made.state.bank).toBe(0);
  });

  it('carries the bank to the next week', () => {
    const made = makeTransfers(
      squad({ bank: 7 }),
      [{ outId: 3, inId: 103 }],
      market({ 103: 45 }),
    );
    expect(made.state.bank).toBe(12);
  });

  it('refuses a fourth player from one club', () => {
    // players 1 to 3 play for club 50, and a fourth comes in from it
    expect(() =>
      makeTransfers(
        squad(),
        [{ outId: 8, inId: 108 }],
        market({}, { 1: 50, 2: 50, 3: 50, 108: 50 }),
      ),
    ).toThrow('club 50 has 4');
  });

  it('counts a player at the club he has moved to, and lets a move-made four stand', () => {
    // bought at clubs 1 to 15; players 1, 2 and 3 have since moved to club 50,
    // and so has player 4: four at club 50, none of it the manager's doing
    const moved = market({}, { 1: 50, 2: 50, 3: 50, 4: 50 });
    const made = makeTransfers(squad(), [{ outId: 8, inId: 108 }], moved);
    expect(made.state.players.find((player) => player.id === 4)?.teamId).toBe(50);
    // but buying into that club is still refused
    expect(() =>
      makeTransfers(
        squad(),
        [{ outId: 8, inId: 108 }],
        market({}, { 1: 50, 2: 50, 3: 50, 108: 50 }),
      ),
    ).toThrow('club 50 has 4');
  });

  it('refuses a swap out of position, an unowned seller or a player bought twice', () => {
    expect(() => makeTransfers(squad(), [{ outId: 3, inId: 108 }], market())).toThrow(
      "doesn't play DEF",
    );
    expect(() => makeTransfers(squad(), [{ outId: 99, inId: 103 }], market())).toThrow(
      "isn't in the squad",
    );
    expect(() =>
      makeTransfers(
        squad({ freeTransfers: 2 }),
        [
          { outId: 3, inId: 103 },
          { outId: 4, inId: 103 },
        ],
        market(),
      ),
    ).toThrow('once a week');
  });
});

describe('scoreGameweek', () => {
  // keeper 1; defenders 3 to 6; midfielders 8 to 11; forwards 13 and 14.
  // bench: keeper 2, then 12 (mid), 7 (def), 15 (fwd)
  const selection: Selection = {
    startingXI: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 12, 7, 15],
    captainId: 13,
    viceCaptainId: 8,
  };
  const positionOf = (id: number): Position => SHAPE[id - 1] ?? 'MID';
  const outcomes =
    (overrides: Record<number, { points: number; minutes: number }>) => (id: number) =>
      overrides[id] ?? { points: 2, minutes: 90 };

  it('adds up the eleven and doubles the captain', () => {
    const score = scoreGameweek(
      selection,
      positionOf,
      outcomes({ 13: { points: 10, minutes: 90 } }),
    );
    expect(score.points).toBe(10 * 2 + 10 * 2);
    expect(score.doubledId).toBe(13);
    expect(score.subbedOn).toEqual([]);
  });

  it('brings on the first bench player who played and keeps the shape legal', () => {
    // a midfielder misses out: the first sub (12, a midfielder) comes on
    const score = scoreGameweek(
      selection,
      positionOf,
      outcomes({ 9: { points: 0, minutes: 0 }, 12: { points: 6, minutes: 90 } }),
    );
    expect(score.subbedOn).toEqual([12]);
    expect(score.points).toBe(9 * 2 + 6 + 2 * 2);
  });

  it('skips a sub who would break the formation', () => {
    // two of the four defenders miss out. midfielder 12 replaces the first,
    // leaving three at the back; forward 15 can't replace the second (two
    // defenders is illegal), so defender 7 comes on past him
    const score = scoreGameweek(
      { ...selection, bench: [2, 12, 15, 7] },
      positionOf,
      outcomes({
        3: { points: 0, minutes: 0 },
        4: { points: 0, minutes: 0 },
      }),
    );
    expect(score.subbedOn).toEqual([12, 7]);
  });

  it('only swaps keeper for keeper', () => {
    const benchKeeperPlays = scoreGameweek(
      selection,
      positionOf,
      outcomes({ 1: { points: 0, minutes: 0 }, 2: { points: 3, minutes: 90 } }),
    );
    expect(benchKeeperPlays.subbedOn).toEqual([2]);
    const neither = scoreGameweek(
      selection,
      positionOf,
      outcomes({ 1: { points: 0, minutes: 0 }, 2: { points: 0, minutes: 0 } }),
    );
    expect(neither.subbedOn).toEqual([]);
  });

  it('doubles the vice when the captain plays no minutes, and nobody when neither does', () => {
    const vice = scoreGameweek(
      selection,
      positionOf,
      outcomes({ 13: { points: 0, minutes: 0 }, 8: { points: 7, minutes: 90 } }),
    );
    expect(vice.doubledId).toBe(8);
    const none = scoreGameweek(
      selection,
      positionOf,
      outcomes({ 13: { points: 0, minutes: 0 }, 8: { points: 0, minutes: 0 } }),
    );
    expect(none.doubledId).toBeNull();
  });

  it('rejects a selection that is not eleven and four', () => {
    expect(() =>
      scoreGameweek({ ...selection, bench: [2, 12, 7] }, positionOf, outcomes({})),
    ).toThrow('eleven starters and four');
  });
});
