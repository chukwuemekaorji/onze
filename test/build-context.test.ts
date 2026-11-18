import { describe, it, expect } from 'vitest';
import {
  buildAnalysisPlayer,
  buildLeagueStandings,
  computeFreeTransfers,
} from '../lib/build-context.js';
import type {
  FplBootstrapStatic,
  FplClassicLeague,
  FplElement,
  FplEntry,
  FplEntryHistoryResponse,
} from '../lib/fpl-types.js';

function makeLeague(overrides: Partial<FplClassicLeague> = {}): FplClassicLeague {
  return {
    id: 1,
    name: 'Test League',
    league_type: 'x',
    rank_count: 10,
    entry_rank: 1,
    entry_last_rank: 1,
    ...overrides,
  };
}

function makeEntry(classic: FplClassicLeague[]): FplEntry {
  return {
    id: 1,
    player_first_name: 'Alex',
    player_last_name: 'Hunt',
    name: 'Test Team',
    summary_overall_points: 0,
    summary_overall_rank: 0,
    current_event: 1,
    last_deadline_bank: 0,
    last_deadline_value: 0,
    leagues: { classic },
  };
}

function makeHistory(
  current: Array<{
    event: number;
    event_transfers: number;
    event_transfers_cost: number;
  }>,
  chips: FplEntryHistoryResponse['chips'] = [],
): FplEntryHistoryResponse {
  return {
    current: current.map((c) => ({
      ...c,
      points: 0,
      total_points: 0,
      rank: 0,
      overall_rank: 0,
    })),
    chips,
  };
}

describe('computeFreeTransfers', () => {
  it('gives every manager 1 free transfer entering gameweek 2', () => {
    const history = makeHistory([
      { event: 1, event_transfers: 0, event_transfers_cost: 0 },
    ]);
    expect(computeFreeTransfers(history, 2)).toBe(1);
  });

  it('banks an unused free transfer for the following gameweek', () => {
    const history = makeHistory([
      { event: 1, event_transfers: 0, event_transfers_cost: 0 },
      { event: 2, event_transfers: 0, event_transfers_cost: 0 },
    ]);
    expect(computeFreeTransfers(history, 3)).toBe(2);
  });

  it('resets to 1 after a gameweek that used all free transfers', () => {
    const history = makeHistory([
      { event: 1, event_transfers: 0, event_transfers_cost: 0 },
      { event: 2, event_transfers: 1, event_transfers_cost: 0 },
    ]);
    expect(computeFreeTransfers(history, 3)).toBe(1);
  });

  it('resets to 1, not negative, after taking a hit beyond the bank', () => {
    const history = makeHistory([
      { event: 1, event_transfers: 0, event_transfers_cost: 0 },
      { event: 2, event_transfers: 0, event_transfers_cost: 0 }, // banked to 2
      { event: 3, event_transfers: 4, event_transfers_cost: 8 }, // used all + 2 hits
    ]);
    expect(computeFreeTransfers(history, 4)).toBe(1);
  });

  it('caps banked free transfers at 5', () => {
    const history = makeHistory(
      Array.from({ length: 6 }, (_, i) => ({
        event: i + 1,
        event_transfers: 0,
        event_transfers_cost: 0,
      })),
    );
    expect(computeFreeTransfers(history, 7)).toBe(5);
  });

  it('does not penalize transfers made during a wildcard gameweek', () => {
    const history = makeHistory(
      [
        { event: 1, event_transfers: 0, event_transfers_cost: 0 },
        { event: 2, event_transfers: 8, event_transfers_cost: 0 }, // wildcard, 8 transfers
      ],
      [{ name: 'wildcard', event: 2 }],
    );
    expect(computeFreeTransfers(history, 3)).toBe(2);
  });
});

describe('buildLeagueStandings', () => {
  it('maps a user-joined league to a plain standing', () => {
    const entry = makeEntry([
      makeLeague({
        id: 5,
        name: 'Friends League',
        rank_count: 8,
        entry_rank: 2,
        entry_last_rank: 3,
      }),
    ]);

    expect(buildLeagueStandings(entry)).toEqual([
      { id: 5, name: 'Friends League', rank: 2, previousRank: 3, totalEntries: 8 },
    ]);
  });

  it('excludes FPL system leagues like Overall and country', () => {
    const entry = makeEntry([
      makeLeague({ id: 314, name: 'Overall', league_type: 's' }),
      makeLeague({ id: 261, name: 'England', league_type: 's' }),
      makeLeague({ id: 5, name: 'Friends League', league_type: 'x' }),
    ]);

    const standings = buildLeagueStandings(entry);

    expect(standings).toHaveLength(1);
    expect(standings[0]?.name).toBe('Friends League');
  });

  it('returns an empty list when the manager has joined no private leagues', () => {
    const entry = makeEntry([makeLeague({ league_type: 's' })]);
    expect(buildLeagueStandings(entry)).toEqual([]);
  });
});

function makeElement(overrides: Partial<FplElement> = {}): FplElement {
  return {
    id: 7,
    web_name: 'Jackson',
    first_name: 'Nicolas',
    second_name: 'Jackson',
    team: 1,
    element_type: 4,
    now_cost: 71,
    cost_change_event: 0,
    cost_change_start: 0,
    selected_by_percent: '12.4',
    form: '11.0',
    points_per_game: '6.0',
    ep_next: '11.0',
    ep_this: '11.0',
    total_points: 54,
    transfers_in_event: 0,
    transfers_out_event: 0,
    chance_of_playing_next_round: null,
    chance_of_playing_this_round: null,
    status: 'a',
    news: '',
    ...overrides,
  };
}

const BOOTSTRAP = {
  events: [],
  element_types: [],
  elements: [],
  teams: [{ id: 1, name: 'Aston Villa', short_name: 'AVL' }],
} as unknown as FplBootstrapStatic;

describe('buildAnalysisPlayer', () => {
  it("reads form, points per game and fpl's projection as separate numbers", () => {
    const player = buildAnalysisPlayer(
      makeElement({ form: '11.0', points_per_game: '6.0', ep_next: '8.3' }),
      BOOTSTRAP,
      [],
      { fromEvent: 11 },
    );
    expect(player.form).toBe(11);
    expect(player.pointsPerGame).toBe(6);
    expect(player.epNext).toBe(8.3);
  });

  it("keeps fpl's availability status", () => {
    for (const status of ['a', 'd', 'i', 's', 'u', 'n'] as const) {
      expect(
        buildAnalysisPlayer(makeElement({ status }), BOOTSTRAP, [], { fromEvent: 11 })
          .status,
      ).toBe(status);
    }
  });

  it('treats an unknown status as unavailable and junk numbers as 0', () => {
    const player = buildAnalysisPlayer(
      makeElement({ status: 'x', points_per_game: 'n/a' }),
      BOOTSTRAP,
      [],
      { fromEvent: 11 },
    );
    expect(player.status).toBe('u');
    expect(player.pointsPerGame).toBe(0);
  });
});
