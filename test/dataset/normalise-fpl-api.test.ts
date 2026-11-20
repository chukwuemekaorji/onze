import { describe, expect, it } from 'vitest';
import { normaliseFplApiSeason } from '../../lib/dataset/normalise-fpl-api.js';
import { fplApiSlice } from '../helpers/dataset-slice.js';

interface SliceBootstrap {
  teams: unknown[];
  element_types: { id: number; singular_name_short: string }[];
  elements: { id: number; element_type: number }[];
}

describe('normaliseFplApiSeason', () => {
  it('turns every history entry of the slice into a typed row', () => {
    const { rows, dropped } = normaliseFplApiSeason(fplApiSlice());

    expect(rows).toHaveLength(200);
    expect(new Set(rows.map((row) => row.playerId)).size).toBe(100);
    expect(dropped).toEqual({});
    expect(rows.every((row) => row.source === 'fpl-api')).toBe(true);
  });

  it("reads one known row, maps fpl's GKP to GK and has no xP", () => {
    const { rows } = normaliseFplApiSeason(fplApiSlice());

    // raya, arsenal v coventry, 2026-27 gameweek 1
    expect(rows.find((row) => row.playerId === 1 && row.gameweek === 1)).toMatchObject({
      playerName: 'David Raya Martín',
      playerCode: 154561,
      position: 'GK',
      teamName: 'Arsenal',
      opponentTeamName: 'Coventry City',
      wasHome: true,
      fixtureDifficulty: 2,
      totalPoints: 6,
      minutes: 90,
      cleanSheets: 1,
      expectedGoalsConceded: 0.2,
      nowCost: 60,
      leaky: { fplExpectedPoints: null },
    });
  });

  it('drops entries for a match that is still being played', () => {
    const input = fplApiSlice();
    const fixtures = (input.fixtures as { id: number; finished: boolean }[]).map(
      (fixture) => (fixture.id === 1 ? { ...fixture, finished: false } : fixture),
    );

    const { dropped } = normaliseFplApiSeason({ ...input, fixtures });

    expect(dropped['unfinished-fixture']).toBeGreaterThan(0);
  });

  it('drops assistant managers, counting each of their entries', () => {
    const input = fplApiSlice();
    const bootstrap = input.bootstrap as SliceBootstrap;
    const firstId = bootstrap.elements[0]?.id;
    const patched: SliceBootstrap = {
      ...bootstrap,
      element_types: [...bootstrap.element_types, { id: 5, singular_name_short: 'AM' }],
      elements: bootstrap.elements.map((element) =>
        element.id === firstId ? { ...element, element_type: 5 } : element,
      ),
    };

    const { rows, dropped } = normaliseFplApiSeason({ ...input, bootstrap: patched });

    expect(rows).toHaveLength(198);
    expect(dropped).toEqual({ 'assistant-manager': 2 });
  });

  it('fails loudly when a player has no element-summary or a malformed one', () => {
    const input = fplApiSlice();
    const missing = new Map(input.summaries);
    missing.delete(1);
    expect(() => normaliseFplApiSeason({ ...input, summaries: missing })).toThrow(
      'fpl 2026-27 player 1: no element-summary was fetched',
    );

    const malformed = new Map(input.summaries);
    malformed.set(1, { history: [{ fixture: 1, round: 1 }] });
    expect(() => normaliseFplApiSeason({ ...input, summaries: malformed })).toThrow(
      'fpl 2026-27 player 1 history entry 1: field "was_home" is missing',
    );
  });

  it('fails loudly on an unknown position', () => {
    const input = fplApiSlice();
    const bootstrap = input.bootstrap as SliceBootstrap;
    const patched = {
      ...bootstrap,
      element_types: bootstrap.element_types.map((type) =>
        type.id === 1 ? { ...type, singular_name_short: 'KEEPER' } : type,
      ),
    };

    expect(() => normaliseFplApiSeason({ ...input, bootstrap: patched })).toThrow(
      'field "position" is "KEEPER"',
    );
  });
});
