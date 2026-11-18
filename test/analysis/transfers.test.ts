import { describe, it, expect } from 'vitest';
import { analyzeTransfers } from '../../lib/analysis/transfers.js';
import { makePlayer, makeSquadContext } from '../helpers/fixtures.js';

describe('analyzeTransfers', () => {
  it('flags a poor-form squad player and ranks affordable replacements', () => {
    const weak = makePlayer({
      id: 1,
      form: 1,
      epNext: 1,
      nowCost: 50,
      position: 'MID',
    });
    const squad = makeSquadContext({ squad: [weak], bank: 5, freeTransfers: 1 });

    const goodReplacement = makePlayer({
      id: 2,
      form: 8,
      epNext: 8,
      nowCost: 55,
      position: 'MID',
    });
    const tooExpensive = makePlayer({
      id: 3,
      form: 9,
      epNext: 9,
      nowCost: 100,
      position: 'MID',
    });
    const wrongPosition = makePlayer({
      id: 4,
      form: 9,
      epNext: 9,
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
    const strong = makePlayer({ id: 1, form: 9, epNext: 9, chanceOfPlayingNextRound: 100 });
    const squad = makeSquadContext({ squad: [strong] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions).toEqual([]);
  });

  it('does not recommend a hit when the gain is smaller than the -4 cost', () => {
    const weak = makePlayer({ id: 1, form: 1, epNext: 5, nowCost: 50, position: 'MID' });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });

    const smallUpgrade = makePlayer({
      id: 2,
      form: 8,
      epNext: 7, // only +2, not worth a 4-point hit
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
    const weak = makePlayer({ id: 1, form: 1, epNext: 2, nowCost: 50, position: 'MID' });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });

    const bigUpgrade = makePlayer({
      id: 2,
      form: 9,
      epNext: 10, // +8 clears the 4-point hit
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [bigUpgrade]);

    expect(result.recommendedCount).toBe(1);
    expect(result.pointsHitCost).toBe(4);
    expect(result.projectedNetGain).toBe(4);
  });

  it('skips even a well-justified hit while leading a league', () => {
    const weak = makePlayer({ id: 1, form: 1, epNext: 2, nowCost: 50, position: 'MID' });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });

    const bigUpgrade = makePlayer({
      id: 2,
      form: 9,
      epNext: 10, // +8 would normally clear the hit
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [bigUpgrade], { isLeadingALeague: true });

    expect(result.recommendedCount).toBe(0);
    expect(result.pointsHitCost).toBe(0);
    expect(result.projectedNetGain).toBe(0);
  });

  it('still uses free transfers while leading a league — only hits are off', () => {
    const weak = makePlayer({ id: 1, form: 1, epNext: 2, nowCost: 50, position: 'MID' });
    const squad = makeSquadContext({ squad: [weak], bank: 5, freeTransfers: 1 });

    const goodReplacement = makePlayer({
      id: 2,
      form: 8,
      epNext: 8,
      nowCost: 55,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [goodReplacement], { isLeadingALeague: true });

    expect(result.recommendedCount).toBe(1);
    expect(result.pointsHitCost).toBe(0);
  });

  it('never stacks more than one hit, even when the raw math looks net-positive', () => {
    // five +5 swaps is +25 for -16, net +9 on paper, but stacking hits is a
    // gamble, so at most one hit is ever recommended
    const weakLinks = [1, 2, 3, 4, 5].map((id) =>
      makePlayer({ id, form: 1, epNext: 2, nowCost: 50, position: 'MID' }),
    );
    const squad = makeSquadContext({ squad: weakLinks, bank: 100, freeTransfers: 0 });

    const replacements = [6, 7, 8, 9, 10].map((id) =>
      makePlayer({ id, form: 8, epNext: 7, nowCost: 50, position: 'MID' }),
    );

    const result = analyzeTransfers(squad, replacements);

    expect(result.recommendedCount).toBeLessThanOrEqual(1);
    expect(result.pointsHitCost).toBeLessThanOrEqual(4);
  });

  it('skips a hit-funded transfer whose gain only barely clears the -4 cost', () => {
    // +5 for -4 is net positive, but too thin for a one-week estimate
    const weak = makePlayer({ id: 1, form: 1, epNext: 2, nowCost: 50, position: 'MID' });
    const squad = makeSquadContext({ squad: [weak], bank: 50, freeTransfers: 0 });
    const thinUpgrade = makePlayer({
      id: 2,
      form: 8,
      epNext: 7,
      nowCost: 50,
      position: 'MID',
    });

    const result = analyzeTransfers(squad, [thinUpgrade]);

    expect(result.recommendedCount).toBe(0);
    expect(result.pointsHitCost).toBe(0);
  });

  it('recommends multiple transfers when free transfers and gains allow it', () => {
    const weakOne = makePlayer({ id: 1, form: 1, epNext: 2, nowCost: 50, position: 'MID' });
    const weakTwo = makePlayer({ id: 2, form: 1, epNext: 3, nowCost: 45, position: 'DEF' });
    const squad = makeSquadContext({
      squad: [weakOne, weakTwo],
      bank: 20,
      freeTransfers: 2,
    });

    const replacementOne = makePlayer({
      id: 3,
      form: 8,
      epNext: 7,
      nowCost: 55,
      position: 'MID',
    });
    const replacementTwo = makePlayer({
      id: 4,
      form: 8,
      epNext: 6,
      nowCost: 50,
      position: 'DEF',
    });

    const result = analyzeTransfers(squad, [replacementOne, replacementTwo]);

    expect(result.recommendedCount).toBe(2);
    expect(result.pointsHitCost).toBe(0);
    expect(result.suggestions.slice(0, 2).map((s) => s.outPlayer.id).sort()).toEqual([1, 2]);
  });
});
