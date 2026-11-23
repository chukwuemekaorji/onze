/**
 * one season as the backtest plays it: who is in the game each gameweek, at
 * what price, for which club, what they really scored, and the fixture list.
 * pure: dataset rows in
 */

import type { Position } from '../analysis/types.js';
import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';
import type { FixtureOutlook } from '../eval/snapshot.js';
import type { Outcome } from './fpl-rules.js';

/** a player's club and price as of one gameweek */
interface Snapshot {
  gameweek: number;
  teamId: number;
  teamName: string;
  price: number;
}

export interface SeasonPlayer {
  id: number;
  code: number;
  name: string;
  position: Position;
  /** the first and last gameweek the player has a row in */
  firstGameweek: number;
  lastGameweek: number;
  /** one per gameweek with a row, oldest first */
  snapshots: Snapshot[];
}

export interface SeasonData {
  season: string;
  gameweeks: number[];
  players: ReadonlyMap<number, SeasonPlayer>;
  /** what each player really did, by gameweek; no entry means no fixture */
  outcomes: ReadonlyMap<number, ReadonlyMap<number, Outcome>>;
  /** each club's fixtures, by gameweek then club name */
  schedule: ReadonlyMap<number, ReadonlyMap<string, FixtureOutlook[]>>;
}

export function buildSeasonData(
  season: string,
  rows: readonly PlayerGameweekRow[],
): SeasonData {
  const ordered = [...rows].sort(
    (a, b) => a.gameweek - b.gameweek || a.kickoffTime.localeCompare(b.kickoffTime),
  );
  const players = new Map<number, SeasonPlayer>();
  const outcomes = new Map<number, Map<number, Outcome>>();
  const schedule = new Map<number, Map<string, FixtureOutlook[]>>();
  for (const row of ordered) {
    if (row.season !== season) throw new Error(`a ${row.season} row in ${season}`);
    const player = players.get(row.playerId) ?? {
      id: row.playerId,
      code: row.playerCode,
      name: row.playerName,
      position: row.position,
      firstGameweek: row.gameweek,
      lastGameweek: row.gameweek,
      snapshots: [],
    };
    player.lastGameweek = row.gameweek;
    const latest = player.snapshots.at(-1);
    const snapshot = {
      gameweek: row.gameweek,
      teamId: row.teamId,
      teamName: row.teamName,
      price: row.nowCost,
    };
    // a double gameweek's two rows share one snapshot, the later kickoff's
    if (latest?.gameweek === row.gameweek)
      player.snapshots[player.snapshots.length - 1] = snapshot;
    else player.snapshots.push(snapshot);
    players.set(row.playerId, player);

    const week = outcomes.get(row.gameweek) ?? new Map<number, Outcome>();
    const sofar = week.get(row.playerId) ?? { points: 0, minutes: 0 };
    week.set(row.playerId, {
      points: sofar.points + row.totalPoints,
      minutes: sofar.minutes + row.minutes,
    });
    outcomes.set(row.gameweek, week);

    const clubs = schedule.get(row.gameweek) ?? new Map<string, FixtureOutlook[]>();
    const fixtures = clubs.get(row.teamName) ?? [];
    if (!fixtures.some((fixture) => fixture.fixtureId === row.fixtureId)) {
      fixtures.push({
        fixtureId: row.fixtureId,
        opponentTeamId: row.opponentTeamId,
        opponentTeamName: row.opponentTeamName,
        wasHome: row.wasHome,
        fixtureDifficulty: row.fixtureDifficulty,
        kickoffTime: row.kickoffTime,
      });
    }
    clubs.set(row.teamName, fixtures);
    schedule.set(row.gameweek, clubs);
  }
  return {
    season,
    gameweeks: [...outcomes.keys()].sort((a, b) => a - b),
    players,
    outcomes,
    schedule,
  };
}

/** the latest snapshot at or before the gameweek; null before the player arrived */
function snapshotAt(player: SeasonPlayer, gameweek: number): Snapshot | null {
  let found: Snapshot | null = null;
  for (const snapshot of player.snapshots) {
    if (snapshot.gameweek > gameweek) break;
    found = snapshot;
  }
  return found;
}

/**
 * in the game at this deadline: arrived by now and not yet gone. a club
 * blank leaves no row, so a player between two rows still counts
 */
export function isInGame(player: SeasonPlayer, gameweek: number): boolean {
  return player.firstGameweek <= gameweek && gameweek <= player.lastGameweek;
}

/** the price at this deadline: the gameweek's own, or the last one seen */
export function priceAt(player: SeasonPlayer, gameweek: number): number {
  const snapshot = snapshotAt(player, gameweek) ?? player.snapshots[0];
  if (snapshot === undefined) throw new Error(`player ${player.id} has no price`);
  return snapshot.price;
}

export function clubAt(
  player: SeasonPlayer,
  gameweek: number,
): { teamId: number; teamName: string } {
  const snapshot = snapshotAt(player, gameweek) ?? player.snapshots[0];
  if (snapshot === undefined) throw new Error(`player ${player.id} has no club`);
  return { teamId: snapshot.teamId, teamName: snapshot.teamName };
}

/** a club's fixtures in one gameweek: two in a double, none in a blank */
export function fixturesOf(
  data: SeasonData,
  teamName: string,
  gameweek: number,
): FixtureOutlook[] {
  return data.schedule.get(gameweek)?.get(teamName) ?? [];
}

const NO_FIXTURE: Outcome = { points: 0, minutes: 0 };

export function outcomeOf(
  data: SeasonData,
  gameweek: number,
  playerId: number,
): Outcome {
  return data.outcomes.get(gameweek)?.get(playerId) ?? NO_FIXTURE;
}
