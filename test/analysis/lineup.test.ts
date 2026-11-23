import { describe, it, expect } from 'vitest';
import { analyzeLineup } from '../../lib/analysis/lineup.js';
import { makePlayer, makeProjection } from '../helpers/fixtures.js';
import type { AnalysisPlayer } from '../../lib/analysis/types.js';

function fixture(event: number, difficulty = 3) {
  return [
    {
      event,
      isHome: true,
      difficulty,
      opponentShortName: 'XXX',
      opponentName: 'XXX FC',
    },
  ];
}

function standardSquad(): AnalysisPlayer[] {
  const players: AnalysisPlayer[] = [];
  let id = 1;
  const add = (position: AnalysisPlayer['position'], count: number, points: number) => {
    for (let i = 0; i < count; i++) {
      players.push(
        makePlayer({
          id: id++,
          position,
          projection: makeProjection({ points }),
          nextFixtures: fixture(1),
        }),
      );
    }
  };
  add('GK', 2, 4);
  add('DEF', 5, 4);
  add('MID', 5, 4);
  add('FWD', 3, 4);
  return players;
}

describe('analyzeLineup', () => {
  it('produces a valid 11-player XI and 4-player bench with a legal formation', () => {
    const squad = standardSquad();
    const result = analyzeLineup(squad, 1);

    expect(result.startingXI).toHaveLength(11);
    expect(result.bench).toHaveLength(4);

    const startingGkCount = result.startingXI.filter(
      (p) => p.player.position === 'GK',
    ).length;
    expect(startingGkCount).toBe(1);

    const [def, mid, fwd] = result.formation.split('-').map(Number);
    expect(def! + mid! + fwd!).toBe(10);
    expect(def).toBeGreaterThanOrEqual(3);
    expect(mid).toBeGreaterThanOrEqual(2);
    expect(fwd).toBeGreaterThanOrEqual(1);

    const allIds = new Set(
      [...result.startingXI, ...result.bench].map((p) => p.player.id),
    );
    expect(allIds.size).toBe(15);
  });

  it('prioritizes a double-gameweek player over a single-fixture bench-quality player', () => {
    const squad = standardSquad();
    // one forward has a double gameweek; the others have one fixture or none
    squad[12] = makePlayer({
      id: squad[12]!.id,
      position: 'FWD',
      // the projection sums both fixtures: two lots of 2.5
      projection: makeProjection({ points: 5 }),
      nextFixtures: [
        {
          event: 1,
          isHome: true,
          difficulty: 3,
          opponentShortName: 'AAA',
          opponentName: 'AAA FC',
        },
        {
          event: 1,
          isHome: false,
          difficulty: 3,
          opponentShortName: 'BBB',
          opponentName: 'BBB FC',
        },
      ],
    });
    squad[11] = makePlayer({
      id: squad[11]!.id,
      position: 'FWD',
      // a blank projects 0
      projection: makeProjection({ points: 0 }),
      nextFixtures: [],
    });

    const result = analyzeLineup(squad, 1);
    const startingFwdIds = result.startingXI
      .filter((p) => p.player.position === 'FWD')
      .map((p) => p.player.id);

    expect(startingFwdIds).toContain(squad[12]!.id);
  });

  it('returns an empty lineup for an empty squad without crashing', () => {
    const result = analyzeLineup([], 1);

    expect(result.startingXI).toEqual([]);
    expect(result.bench).toEqual([]);
  });
});
