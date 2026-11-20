import { describe, expect, it } from 'vitest';
import type { RawRecord } from '../../lib/dataset/fields.js';
import { normaliseVaastavSeason } from '../../lib/dataset/normalise-vaastav.js';
import { DatasetValidationError } from '../../lib/dataset/player-gameweek.js';
import { vaastavSlice } from '../helpers/dataset-slice.js';

const HAVERTZ_ID = '4';

function withMerged(edit: (rows: RawRecord[]) => RawRecord[]) {
  const files = vaastavSlice();
  return { ...files, mergedGw: edit([...files.mergedGw]) };
}

function firstRow(files = vaastavSlice()): RawRecord {
  const row = files.mergedGw[0];
  if (row === undefined) throw new Error('the slice is empty');
  return row;
}

describe('normaliseVaastavSeason', () => {
  it('turns every row of the slice into a typed row, dropping nothing', () => {
    const { rows, dropped } = normaliseVaastavSeason(vaastavSlice());

    expect(rows).toHaveLength(200);
    expect(new Set(rows.map((row) => row.playerId)).size).toBe(100);
    expect(new Set(rows.map((row) => row.gameweek))).toEqual(new Set([1, 2]));
    expect(dropped).toEqual({});
  });

  it('reads one known row exactly, xP kept apart as leaky', () => {
    const { rows } = normaliseVaastavSeason(vaastavSlice());

    // havertz, arsenal 2-0 wolves, 2024-25 gameweek 1
    expect(rows.find((row) => row.playerId === 4 && row.gameweek === 1)).toEqual({
      season: '2024-25',
      gameweek: 1,
      fixtureId: 2,
      playerId: 4,
      playerCode: 219847,
      playerName: 'Kai Havertz',
      position: 'FWD',
      teamId: 1,
      teamName: 'Arsenal',
      opponentTeamId: 20,
      opponentTeamName: 'Wolves',
      wasHome: true,
      kickoffTime: '2024-08-17T14:00:00Z',
      fixtureDifficulty: 3,
      totalPoints: 12,
      minutes: 90,
      starts: 1,
      goalsScored: 1,
      assists: 1,
      cleanSheets: 1,
      goalsConceded: 0,
      saves: 0,
      bonus: 3,
      bps: 48,
      expectedGoals: 0.45,
      expectedAssists: 0.04,
      expectedGoalsConceded: 0.47,
      nowCost: 80,
      source: 'vaastav',
      leaky: { fplExpectedPoints: 3.5 },
    });
  });

  it('gives every row a consistent fixture: own team, a different opponent, a 1 to 5 rating', () => {
    for (const row of normaliseVaastavSeason(vaastavSlice()).rows) {
      expect(row.teamId).not.toBe(row.opponentTeamId);
      expect(row.fixtureDifficulty).toBeGreaterThanOrEqual(1);
      expect(row.fixtureDifficulty).toBeLessThanOrEqual(5);
      expect(['GK', 'DEF', 'MID', 'FWD']).toContain(row.position);
    }
  });

  it('drops assistant manager rows and counts them', () => {
    const files = withMerged((rows) => [...rows, { ...firstRow(), position: 'AM' }]);

    const { rows, dropped } = normaliseVaastavSeason(files);

    expect(rows).toHaveLength(200);
    expect(dropped).toEqual({ 'assistant-manager': 1 });
  });

  it('drops exact duplicates but fails on two rows that disagree', () => {
    const duplicated = withMerged((rows) => [...rows, { ...firstRow() }]);
    expect(normaliseVaastavSeason(duplicated).dropped).toEqual({
      'exact-duplicate': 1,
    });

    const conflicting = withMerged((rows) => [
      ...rows,
      { ...firstRow(), total_points: '99' },
    ]);
    expect(() => normaliseVaastavSeason(conflicting)).toThrow('conflicting rows');
  });

  it('drops rows whose fixture has not finished', () => {
    const files = vaastavSlice();
    const fixtureId = firstRow(files).fixture;
    const fixtures = files.fixtures.map((fixture) =>
      fixture.id === fixtureId ? { ...fixture, finished: 'False' } : fixture,
    );

    const { dropped } = normaliseVaastavSeason({ ...files, fixtures });

    expect(dropped['unfinished-fixture']).toBeGreaterThan(0);
  });

  it('fails loudly on a malformed field, naming the file and line', () => {
    const files = withMerged((rows) => [
      { ...firstRow(), minutes: 'abc' },
      ...rows.slice(1),
    ]);

    expect(() => normaliseVaastavSeason(files)).toThrow(
      new DatasetValidationError(
        'vaastav 2024-25 merged_gw.csv line 2: field "minutes" is "abc", expected a number',
      ),
    );
  });

  it('gives each player the stable code from players_raw.csv, and fails when there is none', () => {
    const files = vaastavSlice();
    const { rows } = normaliseVaastavSeason(files);
    expect(rows.every((row) => row.playerCode > 0)).toBe(true);

    const withoutHavertz = files.playersRaw.filter(
      (player) => player.id !== HAVERTZ_ID,
    );
    expect(() =>
      normaliseVaastavSeason({ ...files, playersRaw: withoutHavertz }),
    ).toThrow("player 4 isn't in players_raw.csv");
  });

  it('blanks the expected stats of a gameweek fpl never published them for', () => {
    // as in 2022-23 before gameweek 16: goals scored, every expected stat 0
    const files = withMerged((records) =>
      records.map((record) =>
        record.GW === '1'
          ? {
              ...record,
              expected_goals: '0',
              expected_assists: '0',
              expected_goal_involvements: '0',
              expected_goals_conceded: '0',
            }
          : record,
      ),
    );
    const { rows } = normaliseVaastavSeason(files);
    const first = rows.filter((row) => row.gameweek === 1);
    const second = rows.filter((row) => row.gameweek === 2);

    expect(first.some((row) => row.goalsScored > 0)).toBe(true);
    expect(first.every((row) => row.expectedGoals === null)).toBe(true);
    expect(first.every((row) => row.expectedGoalsConceded === null)).toBe(true);
    expect(second.some((row) => (row.expectedGoals ?? 0) > 0)).toBe(true);
  });

  it('fails loudly on a missing column, an unknown fixture or a mismatched opponent', () => {
    const { minutes: _minutes, ...withoutMinutes } = firstRow();
    expect(() =>
      normaliseVaastavSeason(withMerged((rows) => [withoutMinutes, ...rows.slice(1)])),
    ).toThrow('field "minutes" is missing');

    expect(() =>
      normaliseVaastavSeason(
        withMerged((rows) => [{ ...firstRow(), fixture: '9999' }, ...rows.slice(1)]),
      ),
    ).toThrow("fixture 9999 isn't in fixtures.csv");

    const havertz = vaastavSlice().mergedGw.find(
      (row) => row.element === HAVERTZ_ID && row.round === '1',
    );
    expect(() =>
      normaliseVaastavSeason(
        withMerged((rows) => [
          ...rows.filter((row) => row !== havertz),
          { ...havertz, opponent_team: '5' },
        ]),
      ),
    ).toThrow("doesn't match the fixture");
  });
});
