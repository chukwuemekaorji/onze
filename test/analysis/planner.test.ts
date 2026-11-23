import { describe, expect, it } from 'vitest';
import {
  MIN_SWAP_GAIN,
  bestWeekLineup,
  planTransfers,
  weekWeights,
} from '../../lib/analysis/planner.js';
import type { TransferPlan } from '../../lib/analysis/planner.js';
import { nextFreeTransfers } from '../../lib/analysis/transfers.js';
import type { AnalysisPlayer, Position } from '../../lib/analysis/types.js';
import { makePlayer, makeProjection, makeSquadContext } from '../helpers/fixtures.js';

const WEEKS = 5;
const FLAT = [3, 3, 3, 3, 3];

let nextId = 1000;
function player(
  position: Position,
  teamId: number,
  weeklyPoints: number[] = FLAT,
  overrides: Partial<AnalysisPlayer> = {},
): AnalysisPlayer {
  const id = nextId++;
  return makePlayer({
    id,
    webName: `P${id}`,
    position,
    teamId,
    teamName: `Club ${teamId}`,
    nowCost: 50,
    projection: makeProjection({ points: weeklyPoints[0] ?? 0, weeklyPoints }),
    ...overrides,
  });
}

/**
 * a legal fifteen, one club each, everyone on 3 a week but a forward on 20,
 * so the captain never changes and the sums stay easy to follow
 */
function squad() {
  return {
    keepers: [player('GK', 1), player('GK', 2)],
    defenders: [3, 4, 5, 6, 7].map((team) => player('DEF', team)),
    midfielders: [8, 9, 10, 11, 12].map((team) => player('MID', team)),
    forwards: [
      player('FWD', 13, [20, 20, 20, 20, 20]),
      player('FWD', 14),
      player('FWD', 15),
    ],
  };
}

function all(parts: ReturnType<typeof squad>): AnalysisPlayer[] {
  return [
    ...parts.keepers,
    ...parts.defenders,
    ...parts.midfielders,
    ...parts.forwards,
  ];
}

function plan(
  players: AnalysisPlayer[],
  extras: AnalysisPlayer[],
  options: { freeTransfers?: number; bank?: number; isLeadingALeague?: boolean } = {},
): TransferPlan {
  return planTransfers(
    makeSquadContext({
      squad: players,
      freeTransfers: options.freeTransfers ?? 1,
      bank: options.bank ?? 0,
    }),
    [...players, ...extras],
    { weeks: WEEKS, isLeadingALeague: options.isLeadingALeague === true },
  );
}

/** "out>in" per swap, "save" for a week without one */
function moves(result: TransferPlan): string[] {
  return result.weeks.map((week) =>
    week.swaps.length === 0
      ? 'save'
      : week.swaps.map((swap) => `${swap.out.id}>${swap.in.id}`).join('+'),
  );
}

describe('nextFreeTransfers', () => {
  it('adds one a week, banks up to five, and leaves one after a hit', () => {
    expect(nextFreeTransfers(1, 0)).toBe(2);
    expect(nextFreeTransfers(5, 0)).toBe(5);
    expect(nextFreeTransfers(3, 1)).toBe(3);
    expect(nextFreeTransfers(2, 2)).toBe(1);
    expect(nextFreeTransfers(1, 2)).toBe(1);
  });

  it('rejects counts that are not whole numbers from 0', () => {
    expect(() => nextFreeTransfers(-1, 0)).toThrow('whole numbers');
    expect(() => nextFreeTransfers(1, 0.5)).toThrow('whole numbers');
  });
});

describe('weekWeights', () => {
  it('counts each later week 0.85 of the one before', () => {
    const weights = weekWeights(5);
    expect(weights[0]).toBe(1);
    expect(weights[1]).toBeCloseTo(0.85);
    expect(weights[4]).toBeCloseTo(0.85 ** 4);
  });
});

describe('bestWeekLineup', () => {
  it('picks the best legal eleven and counts the captain twice', () => {
    const parts = squad();
    const lineup = bestWeekLineup(all(parts), 0);
    // 1 keeper + 10 outfield at 3, the 20-point forward among them, captain twice
    expect(lineup.points).toBe(3 + 9 * 3 + 20 + 20);
    expect(lineup.captain?.id).toBe(parts.forwards[0]?.id);
  });

  it('scores 0 without a keeper, and 0 past the weeks predicted', () => {
    const parts = squad();
    expect(bestWeekLineup([...parts.defenders, ...parts.midfielders], 0).points).toBe(
      0,
    );
    expect(bestWeekLineup(all(parts), WEEKS).points).toBe(0);
  });
});

describe('planTransfers', () => {
  it('saves every week when nothing is worth buying, banking up to five', () => {
    const result = plan(all(squad()), [player('MID', 20)], { freeTransfers: 1 });
    expect(moves(result)).toEqual(['save', 'save', 'save', 'save', 'save']);
    expect(result.weeks.map((week) => week.freeTransfers)).toEqual([1, 2, 3, 4, 5]);
    expect(result.weeks.map((week) => week.freeTransfersAfter)).toEqual([
      2, 3, 4, 5, 5,
    ]);
    expect(result.weeks[0]?.reason).toEqual({ kind: 'nothing_worth_it' });
  });

  it('ignores a swap worth less than a point', () => {
    const parts = squad();
    const barelyBetter = player('MID', 20, [3.1, 3.1, 3.1, 3.1, 3.1]);
    expect(0.1 * weekWeights(WEEKS).reduce((a, b) => a + b, 0)).toBeLessThan(
      MIN_SWAP_GAIN,
    );
    expect(moves(plan(all(parts), [barelyBetter]))).toEqual([
      'save',
      'save',
      'save',
      'save',
      'save',
    ]);
  });

  it('saves a transfer when two big moves arrive together next week', () => {
    // a 5-3-2 squad whose bench is two midfielders and a forward on 0, so a
    // defender who plays badly this week has no cover: buying early costs points
    const defenders = [3, 4, 5, 6, 7].map((team) => player('DEF', team));
    const parts = {
      keepers: [player('GK', 1), player('GK', 2, [0, 0, 0, 0, 0])],
      defenders,
      midfielders: [
        player('MID', 8),
        player('MID', 9),
        player('MID', 10),
        player('MID', 11, [0, 0, 0, 0, 0]),
        player('MID', 12, [0, 0, 0, 0, 0]),
      ],
      forwards: [
        player('FWD', 13, [20, 20, 20, 20, 20]),
        player('FWD', 14),
        player('FWD', 15, [0, 0, 0, 0, 0]),
      ],
    };
    // worth taking now on its own: +1.2 a week
    const smallNow = player('FWD', 21, [4.2, 4.2, 4.2, 4.2, 4.2]);
    // poor this week, then 9 a week from next week
    const firstDefender = player('DEF', 22, [1, 9, 9, 9, 9]);
    const secondDefender = player('DEF', 23, [1, 9, 9, 9, 9]);
    const extras = [smallNow, firstDefender, secondDefender];
    // leading a league rules out hits, so only banked transfers can do both at once
    const result = plan(all(parts), extras, { isLeadingALeague: true });

    expect(result.weeks[0]?.swaps).toEqual([]);
    expect(result.weeks[0]?.reason).toEqual({
      kind: 'save_for',
      nextEvent: 2,
      freeTransfersThen: 2,
      swapsThen: 2,
    });
    expect(result.weeks[1]?.swaps.map((swap) => swap.in.id).sort()).toEqual(
      [firstDefender.id, secondDefender.id].sort(),
    );
    expect(result.weeks[1]?.swaps.every((swap) => !swap.hit)).toBe(true);
    // the small move still happens, a week later, with the next free transfer
    expect(result.weeks[2]?.swaps.map((swap) => swap.in.id)).toEqual([smallNow.id]);

    // and it clearly beats spending the transfer now, scored the same way:
    // small move now, one defender next week, the other the week after
    const [firstOut, secondOut] = defenders;
    const forwardOut = parts.forwards[1];
    if (firstOut === undefined || secondOut === undefined || forwardOut === undefined) {
      throw new Error('squad changed');
    }
    const swap = (list: AnalysisPlayer[], out: AnalysisPlayer, into: AnalysisPlayer) =>
      list.map((p) => (p.id === out.id ? into : p));
    const afterSmall = swap(all(parts), forwardOut, smallNow);
    const afterOne = swap(afterSmall, firstOut, firstDefender);
    const afterBoth = swap(afterOne, secondOut, secondDefender);
    const weights = weekWeights(WEEKS);
    const spendNowObjective = [
      afterSmall,
      afterOne,
      afterBoth,
      afterBoth,
      afterBoth,
    ].reduce(
      (total, players, week) =>
        total + (weights[week] ?? 0) * bestWeekLineup(players, week).points,
      0,
    );
    expect(result.hitCost).toBe(0);
    expect(result.objective).toBeGreaterThan(spendNowObjective + 1);
  });

  it('takes one hit when the extra swap clearly pays, and marks it', () => {
    const parts = squad();
    const first = player('DEF', 22, [11, 11, 11, 11, 11]);
    const second = player('MID', 23, [11, 11, 11, 11, 11]);
    const result = plan(all(parts), [first, second], { freeTransfers: 1 });

    expect(result.weeks[0]?.swaps).toHaveLength(2);
    expect(result.weeks[0]?.hits).toBe(1);
    expect(result.weeks[0]?.swaps.filter((swap) => swap.hit)).toHaveLength(1);
    expect(result.hitCost).toBe(4);
    // a hit leaves one free transfer for next week
    expect(result.weeks[0]?.freeTransfersAfter).toBe(1);
  });

  it('never takes a hit while leading a league', () => {
    const parts = squad();
    const extras = [
      player('DEF', 22, [11, 11, 11, 11, 11]),
      player('MID', 23, [11, 11, 11, 11, 11]),
    ];
    const result = plan(all(parts), extras, { isLeadingALeague: true });
    expect(result.hitCost).toBe(0);
    expect(result.weeks.every((week) => week.hits === 0)).toBe(true);
    expect(result.weeks[0]?.swaps).toHaveLength(1);
  });

  it("won't pay a hit for a swap that doesn't clearly cover it", () => {
    const parts = squad();
    const big = player('DEF', 22, [11, 11, 11, 11, 11]);
    // +1.4 a week is about 5.2 over the plan, short of 4 plus the 2-point margin
    const modest = player('MID', 23, [4.4, 4.4, 4.4, 4.4, 4.4]);
    const result = plan(all(parts), [big, modest], { freeTransfers: 1 });
    expect(result.hitCost).toBe(0);
    expect(moves(result).slice(0, 2)).toEqual([
      `${parts.defenders[0]?.id ?? 0}>${big.id}`,
      `${parts.midfielders[0]?.id ?? 0}>${modest.id}`,
    ]);
  });

  it('takes at most one hit in a week', () => {
    const parts = squad();
    const extras = [
      player('DEF', 22, [11, 11, 11, 11, 11]),
      player('MID', 23, [11, 11, 11, 11, 11]),
      player('FWD', 24, [11, 11, 11, 11, 11]),
    ];
    const result = plan(all(parts), extras, { freeTransfers: 1 });
    expect(result.weeks.every((week) => week.hits <= 1)).toBe(true);
    expect(result.weeks[0]?.swaps.length).toBeLessThanOrEqual(2);
  });

  it('carries the bank: money freed one week buys a dearer player the next', () => {
    const parts = squad();
    const [pricey] = parts.midfielders;
    if (pricey === undefined) throw new Error('squad helper changed');
    const squadWithPricey = all({
      ...parts,
      midfielders: parts.midfielders.map((p) =>
        p === pricey ? { ...p, nowCost: 60 } : p,
      ),
    });
    // as good as the 6.0m midfielder for 5.0m, slightly better
    const cheaper = player('MID', 21, [3.5, 3.5, 3.5, 3.5, 3.5], { nowCost: 50 });
    // 6.0m: too dear for any 5.0m defender with nothing in the bank
    const star = player('DEF', 22, [9, 9, 9, 9, 9], { nowCost: 60 });
    const result = plan(squadWithPricey, [cheaper, star], { isLeadingALeague: true });

    expect(result.weeks[0]?.swaps.map((swap) => swap.in.id)).toEqual([cheaper.id]);
    expect(result.weeks[0]?.bankAfter).toBe(10);
    expect(result.weeks[1]?.swaps.map((swap) => swap.in.id)).toEqual([star.id]);
    expect(result.weeks[1]?.bankAfter).toBe(0);
  });

  it('never buys a fourth player from one club', () => {
    const parts = squad();
    // three defenders from club 30 already
    const crowded = all({
      ...parts,
      defenders: parts.defenders.map((p, index) =>
        index < 3 ? { ...p, teamId: 30 } : p,
      ),
    });
    const fromCrowdedClub = player('MID', 30, [10, 10, 10, 10, 10]);
    const fromElsewhere = player('MID', 31, [8, 8, 8, 8, 8]);
    const result = plan(crowded, [fromCrowdedClub, fromElsewhere]);
    const bought = result.weeks.flatMap((week) => week.swaps.map((swap) => swap.in.id));

    expect(bought).not.toContain(fromCrowdedClub.id);
    expect(bought).toContain(fromElsewhere.id);
  });

  it('only swaps like for like, so the squad keeps its shape', () => {
    const parts = squad();
    const extras = [
      player('GK', 40, [6, 6, 6, 6, 6]),
      player('DEF', 41, [8, 8, 8, 8, 8]),
      player('FWD', 42, [9, 9, 9, 9, 9]),
    ];
    const result = plan(all(parts), extras, { freeTransfers: 3 });
    const swaps = result.weeks.flatMap((week) => week.swaps);
    expect(swaps.length).toBeGreaterThan(0);
    for (const swap of swaps) expect(swap.in.position).toBe(swap.out.position);
  });

  it("starts from this week's advice when given, and plans only the weeks after", () => {
    const parts = squad();
    const best = player('DEF', 22, [11, 11, 11, 11, 11]);
    const modest = player('MID', 23, [4.4, 4.4, 4.4, 4.4, 4.4]);
    const [defender] = parts.defenders;
    const [midfielder] = parts.midfielders;
    if (defender === undefined || midfielder === undefined)
      throw new Error('squad helper changed');
    // left alone the planner buys the defender first; told otherwise, it follows
    const result = planTransfers(
      makeSquadContext({ squad: all(parts), freeTransfers: 1 }),
      [...all(parts), best, modest],
      { weeks: WEEKS, firstWeek: [{ outId: midfielder.id, inId: modest.id }] },
    );
    expect(result.weeks[0]?.swaps.map((swap) => swap.in.id)).toEqual([modest.id]);
    expect(result.weeks[1]?.swaps.map((swap) => swap.in.id)).toEqual([best.id]);
  });

  it("fails loudly when this week's advice names a player it can't see", () => {
    expect(() =>
      planTransfers(makeSquadContext({ squad: all(squad()) }), all(squad()), {
        weeks: WEEKS,
        firstWeek: [{ outId: 1, inId: 999_999 }],
      }),
    ).toThrow("can't see");
  });

  it('rejects a plan of no weeks or a beam of no plans', () => {
    const squadContext = makeSquadContext({ squad: all(squad()) });
    expect(() => planTransfers(squadContext, [], { weeks: 0 })).toThrow('at least one');
    expect(() => planTransfers(squadContext, [], { weeks: 5, beamWidth: 0 })).toThrow(
      'at least one plan',
    );
  });
});
