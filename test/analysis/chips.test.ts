import { describe, it, expect } from 'vitest';
import {
  analyzeChips,
  detectDoubleGameweeks,
  detectBlankGameweeks,
} from '../../lib/analysis/chips.js';
import { makePlayer, makeSquadContext } from '../helpers/fixtures.js';
import type { FplFixture } from '../../lib/fpl-types.js';

function fixture(overrides: Partial<FplFixture>): FplFixture {
  return {
    id: overrides.id ?? Math.random(),
    event: 1,
    team_h: 1,
    team_a: 2,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    finished: false,
    finished_provisional: false,
    kickoff_time: null,
    ...overrides,
  };
}

describe('detectDoubleGameweeks / detectBlankGameweeks', () => {
  it('detects a team with two fixtures in one event as a double', () => {
    const fixtures = [
      fixture({ event: 2, team_h: 1, team_a: 4 }),
      fixture({ event: 2, team_h: 1, team_a: 5 }),
    ];

    const doubles = detectDoubleGameweeks(fixtures);

    expect(doubles).toEqual([{ event: 2, teamIds: [1] }]);
  });

  it('detects a team with zero fixtures in an event (relative to all teams) as a blank', () => {
    const fixtures = [fixture({ event: 3, team_h: 1, team_a: 2 })];

    const blanks = detectBlankGameweeks(fixtures, [1, 2, 3, 4]);

    expect(blanks).toEqual([{ event: 3, teamIds: [3, 4] }]);
  });

  it('returns no gameweeks for an empty fixture list', () => {
    expect(detectDoubleGameweeks([])).toEqual([]);
    expect(detectBlankGameweeks([], [1, 2])).toEqual([]);
  });
});

describe('analyzeChips', () => {
  it('recommends bench boost and triple captain now when 3+ squad teams have a double gameweek', () => {
    const fixtures = [
      fixture({ event: 2, team_h: 1, team_a: 4 }),
      fixture({ event: 2, team_h: 1, team_a: 5 }),
      fixture({ event: 2, team_h: 2, team_a: 6 }),
      fixture({ event: 2, team_h: 2, team_a: 7 }),
      fixture({ event: 2, team_h: 3, team_a: 8 }),
      fixture({ event: 2, team_h: 3, team_a: 9 }),
    ];
    const squad = [
      makePlayer({ id: 1, teamId: 1 }),
      makePlayer({ id: 2, teamId: 2 }),
      makePlayer({ id: 3, teamId: 3 }),
    ];
    const context = makeSquadContext({ squad, currentEvent: 2 });

    const result = analyzeChips(fixtures, [1, 2, 3, 4, 5, 6, 7, 8, 9], context, []);

    const benchBoost = result.suggestions.find((s) => s.chip === 'bench_boost');
    const tripleCaptain = result.suggestions.find((s) => s.chip === 'triple_captain');
    expect(benchBoost?.recommendation).toBe('play_now');
    expect(tripleCaptain?.recommendation).toBe('play_now');
  });

  it('recommends free hit now when 4+ squad teams blank in the current event', () => {
    const fixtures = [fixture({ event: 1, team_h: 1, team_a: 2 })];
    const squad = [
      makePlayer({ id: 1, teamId: 3 }),
      makePlayer({ id: 2, teamId: 4 }),
      makePlayer({ id: 3, teamId: 5 }),
      makePlayer({ id: 4, teamId: 6 }),
    ];
    const context = makeSquadContext({ squad, currentEvent: 1 });

    const result = analyzeChips(fixtures, [1, 2, 3, 4, 5, 6], context, []);

    const freeHit = result.suggestions.find((s) => s.chip === 'free_hit');
    expect(freeHit?.recommendation).toBe('play_now');
  });

  it('recommends holding every chip when there is no fixture disruption', () => {
    const squad = [makePlayer({ id: 1, teamId: 1 })];
    const context = makeSquadContext({ squad, currentEvent: 1 });

    const result = analyzeChips([], [1, 2], context, []);

    expect(result.suggestions.every((s) => s.recommendation === 'hold')).toBe(true);
  });

  it('omits chips already used this season', () => {
    const squad = [makePlayer({ id: 1, teamId: 1 })];
    const context = makeSquadContext({ squad, currentEvent: 1 });

    const result = analyzeChips([], [1], context, ['wildcard', 'bench_boost']);

    expect(result.suggestions.some((s) => s.chip === 'wildcard')).toBe(false);
    expect(result.suggestions.some((s) => s.chip === 'bench_boost')).toBe(false);
  });
});
