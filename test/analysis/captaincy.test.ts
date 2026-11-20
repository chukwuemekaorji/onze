import { describe, it, expect } from 'vitest';
import { analyzeCaptaincy } from '../../lib/analysis/captaincy.js';
import { makePlayer, makeProjection } from '../helpers/fixtures.js';

describe('analyzeCaptaincy', () => {
  it('picks the highest-scoring eligible player as captain', () => {
    const strong = makePlayer({
      id: 1,
      projection: makeProjection({ points: 8 }),
      nextFixtures: [
        { event: 1, isHome: true, difficulty: 2, opponentShortName: 'BBB' },
      ],
    });
    const weak = makePlayer({
      id: 2,
      projection: makeProjection({ points: 3 }),
      nextFixtures: [
        { event: 1, isHome: false, difficulty: 5, opponentShortName: 'CCC' },
      ],
    });

    const result = analyzeCaptaincy([strong, weak], 1);

    expect(result.captain?.player.id).toBe(1);
    expect(result.viceCaptain?.player.id).toBe(2);
  });

  it("ranks on onze's projection, which is 0 for a blank, not fpl's figure", () => {
    const blanking = makePlayer({
      id: 1,
      epNext: 9,
      projection: makeProjection({ points: 0 }),
      nextFixtures: [],
    });
    const playing = makePlayer({
      id: 2,
      epNext: 2,
      projection: makeProjection({ points: 3 }),
    });

    const result = analyzeCaptaincy([blanking, playing], 1);

    expect(result.captain?.player.id).toBe(2);
    expect(result.viceCaptain?.score).toBe(0);
  });

  it('fails loudly when asked about a gameweek the projection is not for', () => {
    expect(() => analyzeCaptaincy([makePlayer()], 2)).toThrow(
      'is for gameweek 1, not 2',
    );
  });

  it('returns nulls when no players are eligible', () => {
    const result = analyzeCaptaincy([], 1);

    expect(result.captain).toBeNull();
    expect(result.viceCaptain).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
