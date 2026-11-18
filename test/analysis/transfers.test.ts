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
    const squad = makeSquadContext({ squad: [weak], bank: 5 });

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
  });

  it('handles a player with no upcoming fixtures without crashing', () => {
    const player = makePlayer({ id: 1, form: 1, nextFixtures: [] });
    const squad = makeSquadContext({ squad: [player] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions[0]?.inCandidates).toEqual([]);
  });

  it('returns no suggestions for an empty squad', () => {
    const squad = makeSquadContext({ squad: [], picks: [] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions).toEqual([]);
  });

  it('does not suggest transferring out a player with no weaknesses', () => {
    const strong = makePlayer({ id: 1, form: 9, epNext: 9, chanceOfPlayingNextRound: 100 });
    const squad = makeSquadContext({ squad: [strong] });

    const result = analyzeTransfers(squad, []);

    expect(result.suggestions).toEqual([]);
  });
});
