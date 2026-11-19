import {
  readBoolean,
  readDifficulty,
  readInteger,
  readOptionalInteger,
  readOptionalNumber,
  readString,
} from './fields.js';
import type { RawRecord } from './fields.js';
import { DatasetValidationError } from './player-gameweek.js';
import type { PlayerGameweekRow } from './player-gameweek.js';

/** the parts of a fixture a row needs, from either source */
export interface FixtureFacts {
  teamHomeId: number;
  teamAwayId: number;
  homeDifficulty: number;
  awayDifficulty: number;
  finished: boolean;
}

/** what the source knows about the player, outside the match row itself */
export interface PlayerFacts {
  playerId: number;
  playerName: string;
  position: PlayerGameweekRow['position'];
}

export function readFixtureFacts(record: RawRecord, where: string): FixtureFacts {
  return {
    teamHomeId: readInteger(record, 'team_h', where),
    teamAwayId: readInteger(record, 'team_a', where),
    homeDifficulty: readDifficulty(record, 'team_h_difficulty', where),
    awayDifficulty: readDifficulty(record, 'team_a_difficulty', where),
    finished: readBoolean(record, 'finished', where),
  };
}

/**
 * vaastav's merged_gw columns copy fpl's element-summary history fields, so one
 * reader serves both. the player's own team comes from the fixture side rather
 * than their current club, which is wrong for anyone who moved mid-season
 */
export function readMatchRow(
  record: RawRecord,
  context: {
    season: string;
    source: PlayerGameweekRow['source'];
    player: PlayerFacts;
    fixture: FixtureFacts;
    teamNames: ReadonlyMap<number, string>;
    where: string;
  },
): Omit<PlayerGameweekRow, 'leaky'> {
  const { season, source, player, fixture, teamNames, where } = context;
  const wasHome = readBoolean(record, 'was_home', where);
  const teamId = wasHome ? fixture.teamHomeId : fixture.teamAwayId;
  const opponentTeamId = readInteger(record, 'opponent_team', where);
  const expectedOpponent = wasHome ? fixture.teamAwayId : fixture.teamHomeId;
  if (opponentTeamId !== expectedOpponent) {
    throw new DatasetValidationError(
      `${where}: opponent ${opponentTeamId} doesn't match the fixture, which says ${expectedOpponent}`,
    );
  }

  return {
    season,
    gameweek: readInteger(record, 'round', where),
    fixtureId: readInteger(record, 'fixture', where),
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    teamId,
    teamName: teamName(teamNames, teamId, where),
    opponentTeamId,
    opponentTeamName: teamName(teamNames, opponentTeamId, where),
    wasHome,
    kickoffTime: readString(record, 'kickoff_time', where),
    fixtureDifficulty: wasHome ? fixture.homeDifficulty : fixture.awayDifficulty,
    totalPoints: readInteger(record, 'total_points', where),
    minutes: readInteger(record, 'minutes', where),
    starts: readOptionalInteger(record, 'starts', where),
    goalsScored: readInteger(record, 'goals_scored', where),
    assists: readInteger(record, 'assists', where),
    cleanSheets: readInteger(record, 'clean_sheets', where),
    goalsConceded: readInteger(record, 'goals_conceded', where),
    saves: readInteger(record, 'saves', where),
    bonus: readInteger(record, 'bonus', where),
    bps: readInteger(record, 'bps', where),
    expectedGoals: readOptionalNumber(record, 'expected_goals', where),
    expectedAssists: readOptionalNumber(record, 'expected_assists', where),
    expectedGoalsConceded: readOptionalNumber(record, 'expected_goals_conceded', where),
    nowCost: readInteger(record, 'value', where),
    source,
  };
}

function teamName(
  names: ReadonlyMap<number, string>,
  id: number,
  where: string,
): string {
  const name = names.get(id);
  if (name === undefined) {
    throw new DatasetValidationError(`${where}: team ${id} isn't in the team list`);
  }
  return name;
}
