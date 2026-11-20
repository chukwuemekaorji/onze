import { describe, it, expect } from 'vitest';
import {
  analyzeTransfers,
  isAvailableToBuy,
  MAX_PLAYERS_PER_CLUB,
  ROTATION_RISK_CHANCE,
} from '../../lib/analysis/transfers.js';
import { makePlayer, makeProjection, makeSquadContext } from '../helpers/fixtures.js';

describe('analyzeTransfers', () => {
  it('flags a poor-form squad player and ranks affordable replacements', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 1 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 5, freeTransfers: 1 });

    const goodReplacement = makePlayer({
      id: 2,
      form: 8,
      projection: makeProjection({ points: 8 }),
      nowCost: 55,
      position: 'MID',
    });
    const tooExpensive = makePlayer({
      id: 3,
      form: 9,
      projection: makeProjection({ points: 9 }),
      nowCost: 100,
      position: 'MID',
    });
    const wrongPosition = makePlayer({
      id: 4,
      form: 9,
      projection: makeProjection({ points: 9 }),
      nowCost: 50,
      position: 'FWD',
    });

    const result = analyzeTransfers(squad, [
      goodReplacement,
      tooExpensive,
      wrongPosition,
    ]);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.outPlayer.id).toBe(1);
    expect(result.suggestions[0]?.reasonCodes).toContain('poor_form');
    expect(result.suggestions[0]?.inCandidates.map((p) => p.id)).toEqual([2]);
    expect(result.suggestions[0]?.expectedPointsGain).toBe(7);
    // a free transfer on a positive gain costs nothing
    expect(result.recommendedCount).toBe(1);
    expect(result.pointsHitCost).toBe(0);
    expect(result.projectedNetGain).toBe(7);
  });

  it('handles a player with no upcoming fixtures without crashing', () => {
    const player = makePlayer({ id: 1, form: 1, nextFixtures: [] });
    const squad = makeSquadContext({ squad: [player] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions[0]?.inCandidates).toEqual([]);
    expect(result.recommendedCount).toBe(0);
  });

  it('returns no suggestions for an empty squad', () => {
    const squad = makeSquadContext({ squad: [], picks: [] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions).toEqual([]);
    expect(result.recommendedCount).toBe(0);
  });

  it('does not suggest transferring out a player with no weaknesses', () => {
    const strong = makePlayer({
      id: 1,
      form: 9,
      projection: makeProjection({ points: 9 }),
      chanceOfPlayingNextRound: 100,
    });
    const squad = makeSquadContext({ squad: [strong] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions).toEqual([]);
  });

  it('does not recommend a hit when the gain is smaller than the -4 cost', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 5 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });

    const smallUpgrade = makePlayer({
      id: 2,
      form: 8,
      projection: makeProjection({ points: 7 }), // only +2, not worth a 4-point hit
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [smallUpgrade]);

    expect(result.recommendedCount).toBe(0);
    expect(result.pointsHitCost).toBe(0);
    expect(result.projectedNetGain).toBe(0);
    // still surfaced as a weak link, just not actioned this week
    expect(result.suggestions[0]?.outPlayer.id).toBe(1);
  });

  it('recommends a hit when the gain outweighs the -4 cost', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });

    const bigUpgrade = makePlayer({
      id: 2,
      form: 9,
      projection: makeProjection({ points: 10 }), // +8 clears the 4-point hit
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [bigUpgrade]);

    expect(result.recommendedCount).toBe(1);
    expect(result.pointsHitCost).toBe(4);
    expect(result.projectedNetGain).toBe(4);
  });

  it('skips even a well-justified hit while leading a league', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });

    const bigUpgrade = makePlayer({
      id: 2,
      form: 9,
      projection: makeProjection({ points: 10 }), // +8 would normally clear the hit
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [bigUpgrade], { isLeadingALeague: true });

    expect(result.recommendedCount).toBe(0);
    expect(result.pointsHitCost).toBe(0);
    expect(result.projectedNetGain).toBe(0);
  });

  it('still uses free transfers while leading a league — only hits are off', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 5, freeTransfers: 1 });

    const goodReplacement = makePlayer({
      id: 2,
      form: 8,
      projection: makeProjection({ points: 8 }),
      nowCost: 55,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [goodReplacement], {
      isLeadingALeague: true,
    });

    expect(result.recommendedCount).toBe(1);
    expect(result.pointsHitCost).toBe(0);
  });

  it('never stacks more than one hit, even when the raw math looks net-positive', () => {
    // five +5 swaps is +25 for -16, net +9 on paper, but stacking hits is a
    // gamble, so at most one hit is ever recommended
    const weakLinks = [1, 2, 3, 4, 5].map((id) =>
      makePlayer({
        id,
        form: 1,
        projection: makeProjection({ points: 2 }),
        nowCost: 50,
        position: 'MID',
      }),
    );
    const squad = makeSquadContext({ squad: weakLinks, bank: 100, freeTransfers: 0 });

    const replacements = [6, 7, 8, 9, 10].map((id) =>
      makePlayer({
        id,
        form: 8,
        projection: makeProjection({ points: 7 }),
        nowCost: 50,
        position: 'MID',
      }),
    );

    const result = analyzeTransfers(squad, replacements);

    expect(result.recommendedCount).toBeLessThanOrEqual(1);
    expect(result.pointsHitCost).toBeLessThanOrEqual(4);
  });

  it('skips a hit-funded transfer whose gain only barely clears the -4 cost', () => {
    // +5 for -4 is net positive, but too thin for a one-week estimate
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });
    const thinUpgrade = makePlayer({
      id: 2,
      form: 8,
      projection: makeProjection({ points: 7 }),
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [thinUpgrade]);

    expect(result.recommendedCount).toBe(0);
    expect(result.pointsHitCost).toBe(0);
  });

  it('recommends multiple transfers when free transfers and gains allow it', () => {
    const weakOne = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const weakTwo = makePlayer({
      id: 2,
      form: 1,
      projection: makeProjection({ points: 3 }),
      nowCost: 45,
      position: 'DEF',
    });
    const squad = makeSquadContext({
      squad: [weakOne, weakTwo],
      bank: 20,
      freeTransfers: 2,
    });

    const replacementOne = makePlayer({
      id: 3,
      form: 8,
      projection: makeProjection({ points: 7 }),
      nowCost: 55,
      position: 'MID',
    });
    const replacementTwo = makePlayer({
      id: 4,
      form: 8,
      projection: makeProjection({ points: 6 }),
      nowCost: 50,
      position: 'DEF',
    });

    const result = analyzeTransfers(squad, [replacementOne, replacementTwo]);

    expect(result.recommendedCount).toBe(2);
    expect(result.pointsHitCost).toBe(0);
    expect(
      result.suggestions
        .slice(0, 2)
        .map((s) => s.outPlayer.id)
        .sort(),
    ).toEqual([1, 2]);
  });

  describe('only buys players fit to play', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      projection: makeProjection({ points: 1 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 20 });

    it('skips an injured or doubtful player, however good his numbers', () => {
      const injured = makePlayer({
        id: 2,
        form: 9,
        projection: makeProjection({ points: 9 }),
        status: 'i',
        chanceOfPlayingNextRound: 0,
      });
      const doubtful = makePlayer({
        id: 3,
        form: 9,
        projection: makeProjection({ points: 9 }),
        status: 'd',
        chanceOfPlayingNextRound: 75,
      });
      const fit = makePlayer({
        id: 4,
        form: 6,
        projection: makeProjection({ points: 6 }),
        status: 'a',
        chanceOfPlayingNextRound: null,
      });

      const result = analyzeTransfers(squad, [injured, doubtful, fit]);

      expect(result.suggestions[0]?.inCandidates.map((p) => p.id)).toEqual([4]);
    });

    it('needs status a and a chance of playing of 75 or more, or none given', () => {
      expect(
        isAvailableToBuy(makePlayer({ status: 'a', chanceOfPlayingNextRound: null })),
      ).toBe(true);
      expect(
        isAvailableToBuy(makePlayer({ status: 'a', chanceOfPlayingNextRound: 75 })),
      ).toBe(true);
      expect(
        isAvailableToBuy(makePlayer({ status: 'a', chanceOfPlayingNextRound: 50 })),
      ).toBe(false);
      for (const status of ['d', 'i', 's', 'u', 'n'] as const) {
        expect(
          isAvailableToBuy(makePlayer({ status, chanceOfPlayingNextRound: 100 })),
        ).toBe(false);
      }
    });

    it('recommends nothing when every upgrade is unavailable', () => {
      const suspended = makePlayer({
        id: 2,
        form: 9,
        projection: makeProjection({ points: 9 }),
        status: 's',
      });

      const result = analyzeTransfers(squad, [suspended]);

      expect(result.recommendedCount).toBe(0);
      expect(result.suggestions[0]?.inCandidates).toEqual([]);
    });
  });

  describe('keeps every club at three players across all the swaps together', () => {
    const CLUB = 9;

    it('lets the first swap take the last place at a club and sends the next one elsewhere', () => {
      // two from club 9 already; both weak links would most like a club 9 player
      const keepers = [10, 11].map((id) =>
        makePlayer({
          id,
          teamId: CLUB,
          form: 9,
          projection: makeProjection({ points: 9 }),
          chanceOfPlayingNextRound: 100,
        }),
      );
      const weakOne = makePlayer({
        id: 1,
        teamId: 1,
        form: 1,
        projection: makeProjection({ points: 1 }),
        nowCost: 50,
        position: 'MID',
      });
      const weakTwo = makePlayer({
        id: 2,
        teamId: 2,
        form: 1,
        projection: makeProjection({ points: 2 }),
        nowCost: 50,
        position: 'MID',
      });
      const squad = makeSquadContext({
        squad: [...keepers, weakOne, weakTwo],
        bank: 0,
        freeTransfers: 2,
      });

      const clubStarA = makePlayer({
        id: 20,
        teamId: CLUB,
        form: 9,
        projection: makeProjection({ points: 9 }),
        nowCost: 50,
      });
      const clubStarB = makePlayer({
        id: 21,
        teamId: CLUB,
        form: 9,
        projection: makeProjection({ points: 8.9 }),
        nowCost: 50,
      });
      const elsewhere = makePlayer({
        id: 22,
        teamId: 3,
        form: 7,
        projection: makeProjection({ points: 7 }),
        nowCost: 50,
      });

      const result = analyzeTransfers(squad, [clubStarA, clubStarB, elsewhere]);
      const bought = result.suggestions
        .slice(0, result.recommendedCount)
        .map((s) => s.inCandidates[0]!);

      expect(result.recommendedCount).toBe(2);
      expect(bought.filter((p) => p.teamId === CLUB)).toHaveLength(1);
      expect(bought.map((p) => p.id)).toContain(22);
      const clubTotal = keepers.length + bought.filter((p) => p.teamId === CLUB).length;
      expect(clubTotal).toBeLessThanOrEqual(MAX_PLAYERS_PER_CLUB);
    });

    it('frees a place when the outgoing player is from the same club', () => {
      const keepers = [10, 11].map((id) =>
        makePlayer({
          id,
          teamId: CLUB,
          form: 9,
          projection: makeProjection({ points: 9 }),
          chanceOfPlayingNextRound: 100,
        }),
      );
      const weak = makePlayer({
        id: 1,
        teamId: CLUB,
        form: 1,
        projection: makeProjection({ points: 1 }),
        nowCost: 50,
        position: 'MID',
      });
      const squad = makeSquadContext({ squad: [...keepers, weak], bank: 0 });
      const clubmate = makePlayer({
        id: 20,
        teamId: CLUB,
        form: 9,
        projection: makeProjection({ points: 9 }),
        nowCost: 50,
      });

      const result = analyzeTransfers(squad, [clubmate]);

      expect(result.suggestions[0]?.inCandidates[0]?.id).toBe(20);
    });
  });

  describe('carries the bank from one swap to the next', () => {
    it('spends what the first swap leaves, not the starting bank twice', () => {
      // 1.0m in the bank. each 5.8m upgrade alone fits (5.0m + 1.0m), but
      // after the first only 0.2m is left, so the second must be cheaper
      const weakOne = makePlayer({
        id: 1,
        teamId: 1,
        form: 1,
        projection: makeProjection({ points: 1 }),
        nowCost: 50,
        position: 'MID',
      });
      const weakTwo = makePlayer({
        id: 2,
        teamId: 2,
        form: 1,
        projection: makeProjection({ points: 1 }),
        nowCost: 50,
        position: 'MID',
      });
      const squad = makeSquadContext({
        squad: [weakOne, weakTwo],
        bank: 10,
        freeTransfers: 2,
      });

      const pricyA = makePlayer({
        id: 20,
        teamId: 3,
        form: 9,
        projection: makeProjection({ points: 9 }),
        nowCost: 58,
      });
      const pricyB = makePlayer({
        id: 21,
        teamId: 4,
        form: 9,
        projection: makeProjection({ points: 8.9 }),
        nowCost: 58,
      });
      const cheaper = makePlayer({
        id: 22,
        teamId: 5,
        form: 6,
        projection: makeProjection({ points: 6 }),
        nowCost: 52,
      });

      const result = analyzeTransfers(squad, [pricyA, pricyB, cheaper]);
      const bought = result.suggestions
        .slice(0, result.recommendedCount)
        .map((s) => s.inCandidates[0]!.id);

      expect(bought).toEqual([20, 22]);
      const spent = 58 + 52 - 50 - 50;
      expect(spent).toBeLessThanOrEqual(10);
    });

    it('drops a second swap that no longer fits once the first is paid for', () => {
      const weakOne = makePlayer({
        id: 1,
        teamId: 1,
        form: 1,
        projection: makeProjection({ points: 1 }),
        nowCost: 50,
        position: 'MID',
      });
      const weakTwo = makePlayer({
        id: 2,
        teamId: 2,
        form: 1,
        projection: makeProjection({ points: 1 }),
        nowCost: 50,
        position: 'MID',
      });
      const squad = makeSquadContext({
        squad: [weakOne, weakTwo],
        bank: 10,
        freeTransfers: 2,
      });

      const pricyA = makePlayer({
        id: 20,
        teamId: 3,
        form: 9,
        projection: makeProjection({ points: 9 }),
        nowCost: 58,
      });
      const pricyB = makePlayer({
        id: 21,
        teamId: 4,
        form: 9,
        projection: makeProjection({ points: 8.9 }),
        nowCost: 58,
      });

      const result = analyzeTransfers(squad, [pricyA, pricyB]);

      expect(result.recommendedCount).toBe(1);
    });
  });

  it('never offers the same player for two moves it does not recommend', () => {
    // no free transfers and thin gains, so nothing is recommended and both weak
    // links list alternatives from the same small pool
    const weakOne = makePlayer({
      id: 1,
      teamId: 1,
      form: 1,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const weakTwo = makePlayer({
      id: 2,
      teamId: 2,
      form: 1.5,
      projection: makeProjection({ points: 2 }),
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({
      squad: [weakOne, weakTwo],
      bank: 0,
      freeTransfers: 0,
    });
    const pool = [20, 21, 22, 23, 24].map((id) =>
      makePlayer({
        id,
        teamId: id,
        form: 5,
        projection: makeProjection({ points: 5 }),
        nowCost: 50,
      }),
    );

    const result = analyzeTransfers(squad, pool);
    const listedIds = result.suggestions.flatMap((s) =>
      s.inCandidates.map((p) => p.id),
    );

    expect(result.recommendedCount).toBe(0);
    expect(result.suggestions).toHaveLength(2);
    expect(new Set(listedIds).size).toBe(listedIds.length);
  });

  describe("decides on the onze projection, not fpl's ep_next", () => {
    it("ignores fpl's figure entirely", () => {
      const weak = makePlayer({
        id: 1,
        form: 1,
        epNext: 1,
        projection: makeProjection({ points: 2 }),
      });
      const squad = makeSquadContext({ squad: [weak], bank: 20 });
      // fpl rates this one 9, onze 2.5: the gain is onze's +0.5, not fpl's +8
      const hyped = makePlayer({
        id: 2,
        epNext: 9,
        projection: makeProjection({ points: 2.5 }),
      });

      const result = analyzeTransfers(squad, [hyped]);

      expect(result.suggestions[0]?.expectedPointsGain).toBeCloseTo(0.5);
    });

    it('picks by the horizon but shows the gain for the gameweek being planned', () => {
      const weak = makePlayer({
        id: 1,
        form: 1,
        projection: makeProjection({ points: 2 }),
      });
      const squad = makeSquadContext({ squad: [weak], bank: 20 });
      // a great week now, then two blanks, against a steady three weeks
      const oneWeek = makePlayer({
        id: 2,
        projection: makeProjection({ points: 6, horizonPoints: 6 }),
      });
      const steady = makePlayer({
        id: 3,
        projection: makeProjection({ points: 5, horizonPoints: 15 }),
      });

      const result = analyzeTransfers(squad, [oneWeek, steady]);

      expect(result.suggestions[0]?.inCandidates[0]?.id).toBe(3);
      expect(result.suggestions[0]?.expectedPointsGain).toBeCloseTo(3);
    });

    it('calls a player the model expects to sit out a rotation risk, with no fpl flag', () => {
      const benched = makePlayer({
        id: 1,
        form: 5,
        chanceOfPlayingNextRound: null,
        projection: makeProjection({
          points: 1,
          chanceOfPlaying: ROTATION_RISK_CHANCE - 0.1,
        }),
      });
      const squad = makeSquadContext({ squad: [benched], bank: 20 });

      const result = analyzeTransfers(squad, []);

      expect(result.suggestions[0]?.reasonCodes).toEqual(['rotation_risk']);
    });
  });
});
