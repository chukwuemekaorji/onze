import { readInteger, readOptionalNumber, readPosition, readString } from './fields.js';
import type { RawRecord } from './fields.js';
import { readFixtureFacts, readMatchRow } from './match-row.js';
import type { FixtureFacts } from './match-row.js';
import {
  blankUnpublishedExpectedStats,
  dropExactDuplicates,
  countDrop,
  DatasetValidationError,
} from './player-gameweek.js';
import type { NormalisedSeason, PlayerGameweekRow } from './player-gameweek.js';

/** the csv files vaastav keeps per season, already parsed */
export interface VaastavSeasonFiles {
  season: string;
  mergedGw: readonly RawRecord[];
  /** one row per player that season; the only place the archive keeps fpl's stable code */
  playersRaw: readonly RawRecord[];
  fixtures: readonly RawRecord[];
  teams: readonly RawRecord[];
}

// 2024-25's assistant manager chip put managers in the player list as "AM"
const ASSISTANT_MANAGER_POSITION = 'AM';

export function normaliseVaastavSeason(files: VaastavSeasonFiles): NormalisedSeason {
  const { season } = files;
  const teamNames = indexTeams(files.teams, `vaastav ${season} teams.csv`);
  const fixtures = indexFixtures(files.fixtures, `vaastav ${season} fixtures.csv`);
  const playerCodes = indexPlayerCodes(
    files.playersRaw,
    `vaastav ${season} players_raw.csv`,
  );
  const rows: PlayerGameweekRow[] = [];
  const dropped: NormalisedSeason['dropped'] = {};

  files.mergedGw.forEach((record, index) => {
    // +2: the header is line 1
    const where = `vaastav ${season} merged_gw.csv line ${index + 2}`;
    if (record.position === ASSISTANT_MANAGER_POSITION) {
      countDrop(dropped, 'assistant-manager');
      return;
    }

    const fixtureId = readInteger(record, 'fixture', where);
    const fixture = fixtures.get(fixtureId);
    if (fixture === undefined) {
      throw new DatasetValidationError(
        `${where}: fixture ${fixtureId} isn't in fixtures.csv`,
      );
    }
    if (!fixture.finished) {
      countDrop(dropped, 'unfinished-fixture');
      return;
    }

    const playerId = readInteger(record, 'element', where);
    const playerCode = playerCodes.get(playerId);
    if (playerCode === undefined) {
      throw new DatasetValidationError(
        `${where}: player ${playerId} isn't in players_raw.csv`,
      );
    }
    const row = readMatchRow(record, {
      season,
      source: 'vaastav',
      player: {
        playerId,
        playerCode,
        playerName: readString(record, 'name', where),
        position: readPosition(record, 'position', where),
      },
      fixture,
      teamNames,
      where,
    });
    rows.push({
      ...row,
      leaky: { fplExpectedPoints: readOptionalNumber(record, 'xP', where) },
    });
  });

  return {
    season,
    rows: blankUnpublishedExpectedStats(dropExactDuplicates(rows, dropped)),
    dropped,
  };
}

function indexTeams(teams: readonly RawRecord[], where: string): Map<number, string> {
  return new Map(
    teams.map((team, index) => {
      const line = `${where} line ${index + 2}`;
      return [readInteger(team, 'id', line), readString(team, 'name', line)];
    }),
  );
}

function indexPlayerCodes(
  players: readonly RawRecord[],
  where: string,
): Map<number, number> {
  return new Map(
    players.map((player, index) => {
      const line = `${where} line ${index + 2}`;
      return [readInteger(player, 'id', line), readInteger(player, 'code', line)];
    }),
  );
}

function indexFixtures(
  fixtures: readonly RawRecord[],
  where: string,
): Map<number, FixtureFacts> {
  return new Map(
    fixtures.map((fixture, index) => {
      const line = `${where} line ${index + 2}`;
      return [readInteger(fixture, 'id', line), readFixtureFacts(fixture, line)];
    }),
  );
}
