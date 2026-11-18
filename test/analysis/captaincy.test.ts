import { describe, it, expect } from 'vitest';
import { analyzeCaptaincy } from '../../lib/analysis/captaincy.js';
import { makePlayer } from '../helpers/fixtures.js';

describe('analyzeCaptaincy', () => {
  it('picks the highest-scoring eligible player as captain', () => {
    const strong = makePlayer({
      id: 1,
      epNext: 8,
      nextFixtures: [
        { event: 1, isHome: true, difficulty: 2, opponentShortName: 'BBB' },
      ],
    });
    const weak = makePlayer({
      id: 2,
      epNext: 3,
      nextFixtures: [
        { event: 1, isHome: false, difficulty: 5, opponentShortName: 'CCC' },
      ],
    });

    const result = analyzeCaptaincy([strong, weak], 1);

    expect(result.captain?.player.id).toBe(1);
    expect(result.viceCaptain?.player.id).toBe(2);
  });

  it('scores a blanking player (no fixture in the target event) as zero', () => {
    const blanking = makePlayer({ id: 1, epNext: 9, nextFixtures: [] });

    const result = analyzeCaptaincy([blanking], 1);

    expect(result.captain?.score).toBe(0);
  });

  it('returns nulls when no players are eligible', () => {
    const result = analyzeCaptaincy([], 1);

    expect(result.captain).toBeNull();
    expect(result.viceCaptain).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
