import type { Position } from '../analysis/types.js';
import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';

/** one fixture a player faces in the gameweek being predicted: known before the deadline */
export interface FixtureOutlook {
  fixtureId: number;
  opponentTeamId: number;
  wasHome: boolean;
  fixtureDifficulty: number;
  kickoffTime: string;
}

/**
 * what a model may know about a player before the deadline. it carries no
 * points, minutes or stats from the gameweek itself; those stay with the harness
 */
export interface PlayerTarget {
  season: string;
  gameweek: number;
  playerId: number;
  playerName: string;
  position: Position;
  teamId: number;
  /** fpl cost units at the gameweek: 55 means £5.5m */
  nowCost: number;
  /** two in a double gameweek */
  fixtures: readonly FixtureOutlook[];
  /**
   * fpl's own projection for this gameweek, here only so it can be scored as a
   * baseline. it may have seen team news or the result, see PlayerGameweekRow
   */
  leaky: { fplExpectedPoints: number | null };
}

/** what actually happened, summed over a double gameweek's fixtures */
export interface PlayerOutcome {
  totalPoints: number;
  minutes: number;
}

/**
 * everything a model can read when predicting one gameweek. it is built only
 * from rows before that gameweek and holds no reference to anything later, so
 * a model can't read the future even by accident. all of it is frozen
 */
export interface HistoryView {
  readonly season: string;
  readonly gameweek: number;
  /** earliest kickoff of the gameweek being predicted, a stand-in for its deadline */
  readonly firstKickoff: string;
  /** this season's rows from earlier gameweeks, oldest first */
  readonly thisSeason: readonly PlayerGameweekRow[];
  /** whole earlier seasons, oldest first. ids are reused each season, so don't join on playerId */
  readonly earlierSeasons: readonly SeasonRows[];
  /** one player's rows from earlier gameweeks this season, oldest first */
  playerRows(playerId: number): readonly PlayerGameweekRow[];
}

export interface SeasonRows {
  readonly season: string;
  readonly rows: readonly PlayerGameweekRow[];
}

/** one gameweek to predict. the harness shows a model history and targets, never outcomes */
export interface GameweekCase {
  history: HistoryView;
  targets: readonly PlayerTarget[];
  outcomes: ReadonlyMap<number, PlayerOutcome>;
}

const NO_ROWS: readonly PlayerGameweekRow[] = Object.freeze([]);

/**
 * one case per gameweek of the season, in order. every row passed in is frozen
 * in place, so a model can't edit history to smuggle anything through either
 */
export function buildGameweekCases(
  seasons: readonly SeasonRows[],
  season: string,
): GameweekCase[] {
  for (const { rows } of seasons) rows.forEach(freezeRow);
  const thisSeasonRows = seasons.find((entry) => entry.season === season)?.rows;
  if (thisSeasonRows === undefined) throw new Error(`no rows loaded for ${season}`);

  // season labels like "2023-24" sort in time order as plain strings
  const earlierSeasons = Object.freeze(
    seasons
      .filter((entry) => entry.season < season)
      .sort((a, b) => a.season.localeCompare(b.season))
      .map((entry) =>
        Object.freeze({ season: entry.season, rows: Object.freeze([...entry.rows]) }),
      ),
  );
  const ordered = [...thisSeasonRows].sort(byKickoff);
  const gameweeks = [...new Set(ordered.map((row) => row.gameweek))].sort(
    (a, b) => a - b,
  );

  return gameweeks.map((gameweek) => {
    const current = ordered.filter((row) => row.gameweek === gameweek);
    const before = ordered.filter((row) => row.gameweek < gameweek);
    return {
      history: historyView(season, gameweek, current, before, earlierSeasons),
      targets: Object.freeze(targetsFor(current)),
      outcomes: outcomesFor(current),
    };
  });
}

function historyView(
  season: string,
  gameweek: number,
  current: readonly PlayerGameweekRow[],
  before: readonly PlayerGameweekRow[],
  earlierSeasons: readonly SeasonRows[],
): HistoryView {
  const byPlayer = new Map<number, PlayerGameweekRow[]>();
  for (const row of before) {
    const rows = byPlayer.get(row.playerId);
    if (rows === undefined) byPlayer.set(row.playerId, [row]);
    else rows.push(row);
  }
  for (const rows of byPlayer.values()) Object.freeze(rows);

  return Object.freeze({
    season,
    gameweek,
    // the kickoff string is the only thing read from this gameweek's rows; the
    // fixture list is public long before the deadline
    firstKickoff: current.map((row) => row.kickoffTime).sort()[0] ?? '',
    thisSeason: Object.freeze([...before]),
    earlierSeasons,
    playerRows: (playerId: number) => byPlayer.get(playerId) ?? NO_ROWS,
  });
}

function targetsFor(current: readonly PlayerGameweekRow[]): PlayerTarget[] {
  const targets = new Map<number, PlayerTarget>();
  for (const row of current) {
    const fixture: FixtureOutlook = Object.freeze({
      fixtureId: row.fixtureId,
      opponentTeamId: row.opponentTeamId,
      wasHome: row.wasHome,
      fixtureDifficulty: row.fixtureDifficulty,
      kickoffTime: row.kickoffTime,
    });
    const existing = targets.get(row.playerId);
    if (existing !== undefined) {
      targets.set(row.playerId, {
        ...existing,
        fixtures: [...existing.fixtures, fixture],
      });
      continue;
    }
    targets.set(row.playerId, {
      season: row.season,
      gameweek: row.gameweek,
      playerId: row.playerId,
      playerName: row.playerName,
      position: row.position,
      teamId: row.teamId,
      nowCost: row.nowCost,
      fixtures: [fixture],
      // fpl's xP is per gameweek: a double gameweek repeats it on both rows, so
      // it is taken once, not summed
      leaky: { fplExpectedPoints: row.leaky.fplExpectedPoints },
    });
  }
  return [...targets.values()].map((target) =>
    Object.freeze({
      ...target,
      fixtures: Object.freeze(target.fixtures),
      leaky: Object.freeze(target.leaky),
    }),
  );
}

function outcomesFor(
  current: readonly PlayerGameweekRow[],
): ReadonlyMap<number, PlayerOutcome> {
  const outcomes = new Map<number, PlayerOutcome>();
  for (const row of current) {
    const sofar = outcomes.get(row.playerId) ?? { totalPoints: 0, minutes: 0 };
    outcomes.set(row.playerId, {
      totalPoints: sofar.totalPoints + row.totalPoints,
      minutes: sofar.minutes + row.minutes,
    });
  }
  return outcomes;
}

function byKickoff(a: PlayerGameweekRow, b: PlayerGameweekRow): number {
  return a.kickoffTime.localeCompare(b.kickoffTime) || a.gameweek - b.gameweek;
}

function freezeRow(row: PlayerGameweekRow): void {
  Object.freeze(row.leaky);
  Object.freeze(row);
}
