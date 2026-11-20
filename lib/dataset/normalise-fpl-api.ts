import {
  asRecord,
  readArray,
  readInteger,
  readPosition,
  readString,
} from './fields.js';
import type { RawRecord } from './fields.js';
import { readFixtureFacts, readMatchRow } from './match-row.js';
import type { FixtureFacts, PlayerFacts } from './match-row.js';
import {
  dropExactDuplicates,
  countDrop,
  DatasetValidationError,
} from './player-gameweek.js';
import type { NormalisedSeason, PlayerGameweekRow } from './player-gameweek.js';

/** raw json from fpl, unchecked until the normaliser reads it */
export interface FplApiSeasonInput {
  season: string;
  bootstrap: unknown;
  fixtures: unknown;
  /** element-summary response per player id */
  summaries: ReadonlyMap<number, unknown>;
}

const ASSISTANT_MANAGER_POSITION = 'AM';
const API_GOALKEEPER = 'GKP';

/** this season from fpl's own api: one element-summary history per player */
export function normaliseFplApiSeason(input: FplApiSeasonInput): NormalisedSeason {
  const { season } = input;
  const bootstrap = asRecord(input.bootstrap, 'bootstrap-static');
  const teamNames = indexTeams(readArray(bootstrap, 'teams', 'bootstrap-static'));
  const positions = indexPositions(
    readArray(bootstrap, 'element_types', 'bootstrap-static'),
  );
  const fixtures = indexFixtures(input.fixtures);
  const rows: PlayerGameweekRow[] = [];
  const dropped: NormalisedSeason['dropped'] = {};

  for (const rawElement of readArray(bootstrap, 'elements', 'bootstrap-static')) {
    const element = asRecord(rawElement, 'bootstrap-static element');
    const playerId = readInteger(element, 'id', 'bootstrap-static element');
    const where = `fpl ${season} player ${playerId}`;
    const history = readHistory(input.summaries.get(playerId), where);

    const positionName = positions.get(readInteger(element, 'element_type', where));
    if (positionName === ASSISTANT_MANAGER_POSITION) {
      history.forEach(() => countDrop(dropped, 'assistant-manager'));
      continue;
    }
    const player: PlayerFacts = {
      playerId,
      playerCode: readInteger(element, 'code', where),
      // full names, to match vaastav's name column
      playerName: `${readString(element, 'first_name', where)} ${readString(element, 'second_name', where)}`,
      position: readPosition(
        // the api says GKP where vaastav and the rest of the app say GK
        { position: positionName === API_GOALKEEPER ? 'GK' : positionName },
        'position',
        where,
      ),
    };

    history.forEach((rawEntry, index) => {
      const entryWhere = `${where} history entry ${index + 1}`;
      const entry = asRecord(rawEntry, entryWhere);
      const fixtureId = readInteger(entry, 'fixture', entryWhere);
      const fixture = fixtures.get(fixtureId);
      if (fixture === undefined) {
        throw new DatasetValidationError(
          `${entryWhere}: fixture ${fixtureId} isn't in /fixtures/`,
        );
      }
      // history includes a match that is still being played
      if (!fixture.finished) {
        countDrop(dropped, 'unfinished-fixture');
        return;
      }
      const row = readMatchRow(entry, {
        season,
        source: 'fpl-api',
        player,
        fixture,
        teamNames,
        where: entryWhere,
      });
      // fpl's api keeps no past expected points; only vaastav archived them
      rows.push({ ...row, leaky: { fplExpectedPoints: null } });
    });
  }

  return { season, rows: dropExactDuplicates(rows, dropped), dropped };
}

function readHistory(summary: unknown, where: string): readonly unknown[] {
  if (summary === undefined) {
    throw new DatasetValidationError(`${where}: no element-summary was fetched`);
  }
  return readArray(asRecord(summary, `${where} element-summary`), 'history', where);
}

function indexTeams(teams: readonly unknown[]): Map<number, string> {
  return new Map(
    teams.map((raw) => {
      const team = asRecord(raw, 'bootstrap-static team');
      return [
        readInteger(team, 'id', 'bootstrap-static team'),
        readString(team, 'name', 'bootstrap-static team'),
      ];
    }),
  );
}

function indexPositions(types: readonly unknown[]): Map<number, string> {
  return new Map(
    types.map((raw) => {
      const type: RawRecord = asRecord(raw, 'bootstrap-static element type');
      return [
        readInteger(type, 'id', 'bootstrap-static element type'),
        readString(type, 'singular_name_short', 'bootstrap-static element type'),
      ];
    }),
  );
}

function indexFixtures(raw: unknown): Map<number, FixtureFacts> {
  if (!Array.isArray(raw)) {
    throw new DatasetValidationError('/fixtures/: expected a list');
  }
  return new Map(
    raw.map((rawFixture: unknown, index) => {
      const where = `/fixtures/ entry ${index + 1}`;
      const fixture = asRecord(rawFixture, where);
      return [readInteger(fixture, 'id', where), readFixtureFacts(fixture, where)];
    }),
  );
}
