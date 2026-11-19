import { describe, expect, it } from 'vitest';
import { normaliseVaastavSeason } from '../../lib/dataset/normalise-vaastav.js';
import { summariseSeason } from '../../lib/dataset/summarise.js';
import { vaastavSlice } from '../helpers/dataset-slice.js';

describe('summariseSeason', () => {
  it('counts gameweeks, players, rows and rows with minutes', () => {
    const season = normaliseVaastavSeason(vaastavSlice());

    expect(summariseSeason(season)).toEqual({
      season: '2024-25',
      gameweeks: 2,
      firstGameweek: 1,
      lastGameweek: 2,
      players: 100,
      rows: 200,
      rowsWithMinutes: season.rows.filter((row) => row.minutes > 0).length,
      dropped: {},
    });
  });

  it('handles a season with no rows yet', () => {
    expect(summariseSeason({ season: '2027-28', rows: [], dropped: {} })).toMatchObject(
      {
        gameweeks: 0,
        firstGameweek: null,
        lastGameweek: null,
        rows: 0,
      },
    );
  });
});
