import { describe, expect, it } from 'vitest';
import { isNotableStanding, notableLeague } from '../../lib/analysis/leagues.js';
import type { LeagueStanding } from '../../lib/analysis/types.js';

let nextId = 1;
function league(name: string, rank: number, totalEntries: number): LeagueStanding {
  return { id: nextId++, name, rank, previousRank: rank, totalEntries };
}

describe('notableLeague', () => {
  it('ignores a mid-table league, which is the bug this rule fixes', () => {
    expect(
      notableLeague([league('Niger HQ FPL', 231, 1200), league('Office', 7, 14)]),
    ).toBeNull();
  });

  it('names a league the manager leads', () => {
    const office = league('Office', 1, 14);
    expect(notableLeague([league('Niger HQ FPL', 231, 1200), office])).toBe(office);
  });

  it('names a top three finish', () => {
    const family = league('Family', 3, 9);
    expect(notableLeague([league('Niger HQ FPL', 231, 1200), family])).toBe(family);
  });

  it('picks the best rank when several are notable, then the bigger league on a tie', () => {
    const second = league('Uni', 2, 40);
    const smallLead = league('Flat', 1, 4);
    const bigLead = league('Town', 1, 300);
    expect(notableLeague([second, smallLead, bigLead])).toBe(bigLead);
  });

  it('returns null with no leagues at all', () => {
    expect(notableLeague([])).toBeNull();
  });
});

describe('isNotableStanding', () => {
  it('needs at least one rival to lead', () => {
    expect(isNotableStanding(league('Solo', 1, 1))).toBe(false);
    expect(isNotableStanding(league('Pair', 1, 2))).toBe(true);
  });

  it("doesn't count a top three spot that is also last place", () => {
    expect(isNotableStanding(league('Trio', 3, 3))).toBe(false);
    expect(isNotableStanding(league('Pair', 2, 2))).toBe(false);
    expect(isNotableStanding(league('Four', 3, 4))).toBe(true);
  });

  it('rejects ranks fpl has not worked out yet, and bad input', () => {
    expect(isNotableStanding(league('New', 0, 20))).toBe(false);
    expect(isNotableStanding(league('Broken', -1, 20))).toBe(false);
    expect(isNotableStanding(league('Broken', Number.NaN, 20))).toBe(false);
    expect(isNotableStanding(league('Fractional', 1.5, 20))).toBe(false);
  });

  it('stops at fourth place', () => {
    expect(isNotableStanding(league('Close', 4, 50))).toBe(false);
  });
});
