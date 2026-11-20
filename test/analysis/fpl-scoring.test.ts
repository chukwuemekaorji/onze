import { describe, expect, it } from 'vitest';
import { eventPoints, pointsFromEvents } from '../../lib/analysis/fpl-scoring.js';
import type { MatchEvents } from '../../lib/analysis/fpl-scoring.js';

function events(overrides: Partial<MatchEvents> = {}): MatchEvents {
  return {
    minutes: 90,
    goalsScored: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    saves: 0,
    bonus: 0,
    ...overrides,
  };
}

describe('pointsFromEvents', () => {
  it("scores each position by fpl's rules", () => {
    // defender: 2 for 90 minutes, 6 a goal, 4 a clean sheet, 3 bonus
    expect(
      pointsFromEvents('DEF', events({ goalsScored: 1, cleanSheets: 1, bonus: 3 })),
    ).toBe(15);
    // midfielder: 5 a goal, 3 an assist, 1 a clean sheet
    expect(
      pointsFromEvents('MID', events({ goalsScored: 1, assists: 1, cleanSheets: 1 })),
    ).toBe(11);
    // forward: 4 a goal, nothing for a clean sheet
    expect(pointsFromEvents('FWD', events({ goalsScored: 2, cleanSheets: 1 }))).toBe(
      10,
    );
  });

  it('steps goals conceded and saves, and gives a cameo 1', () => {
    expect(eventPoints('GK', events({ goalsConceded: 3, saves: 5 }))).toMatchObject({
      goalsConceded: -1,
      saves: 1,
    });
    expect(eventPoints('MID', events({ goalsConceded: 4 })).goalsConceded).toBe(0);
    expect(pointsFromEvents('FWD', events({ minutes: 20 }))).toBe(1);
    expect(pointsFromEvents('FWD', events({ minutes: 0, goalsConceded: 3 }))).toBe(0);
  });

  it('rejects counts that cannot happen', () => {
    expect(() => pointsFromEvents('MID', events({ goalsScored: -1 }))).toThrow(
      'goalsScored must be a whole number',
    );
    expect(() => pointsFromEvents('MID', events({ saves: 1.5 }))).toThrow('saves');
  });
});
