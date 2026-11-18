import { describe, it, expect } from 'vitest';
import { analyzeCaptaincy } from '../../lib/analysis/captaincy.js';
import { makePlayer, makeSquadContext } from '../helpers/fixtures.js';

describe('analyzeCaptaincy', () => {
  it('picks the highest-scoring eligible player as captain', () => {
    const strong = makePlayer({
      id: 1,
      epNext: 8,
      nextFixtures: [{ event: 1, isHome: true, difficulty: 2, opponentShortName: 'BBB' }],
    });
    const weak = makePlayer({
      id: 2,
      epNext: 3,
      nextFixtures: [{ event: 1, isHome: false, difficulty: 5, opponentShortName: 'CCC' }],
    });
    const squad = makeSquadContext({
      squad: [strong, weak],
      currentEvent: 1,
      picks: [
        { elementId: 1, isCaptain: false, isViceCaptain: false, multiplier: 1 },
        { elementId: 2, isCaptain: false, isViceCaptain: false, multiplier: 1 },
      ],
    });

    const result = analyzeCaptaincy(squad);

    expect(result.captain?.player.id).toBe(1);
    expect(result.viceCaptain?.player.id).toBe(2);
  });

  it('scores a blanking player (no fixture in the target event) as zero', () => {
    const blanking = makePlayer({ id: 1, epNext: 9, nextFixtures: [] });
    const squad = makeSquadContext({
      squad: [blanking],
      currentEvent: 1,
      picks: [{ elementId: 1, isCaptain: false, isViceCaptain: false, multiplier: 1 }],
    });

    const result = analyzeCaptaincy(squad);

    expect(result.captain?.score).toBe(0);
  });

  it('excludes benched players (multiplier 0) from captaincy candidates', () => {
    const benched = makePlayer({ id: 1, epNext: 9 });
    const squad = makeSquadContext({
      squad: [benched],
      picks: [{ elementId: 1, isCaptain: false, isViceCaptain: false, multiplier: 0 }],
    });

    const result = analyzeCaptaincy(squad);

    expect(result.captain).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it('returns nulls for an empty squad', () => {
    const squad = makeSquadContext({ squad: [], picks: [] });

    const result = analyzeCaptaincy(squad);

    expect(result.captain).toBeNull();
    expect(result.viceCaptain).toBeNull();
  });
});
