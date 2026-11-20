import type { Position } from '../analysis/types.js';

/** where a row came from: vaastav's archive for past seasons, fpl's api for this one */
export type DatasetSource = 'vaastav' | 'fpl-api';

/**
 * one player in one fixture. a double gameweek gives a player two rows with the
 * same gameweek and different fixture ids
 */
export interface PlayerGameweekRow {
  /** e.g. "2025-26" */
  season: string;
  gameweek: number;
  fixtureId: number;
  /** fpl's element id. ids are reused each season, so only unique within one */
  playerId: number;
  /** fpl's stable player code: the same person in every season, unlike playerId */
  playerCode: number;
  playerName: string;
  position: Position;
  teamId: number;
  teamName: string;
  opponentTeamId: number;
  opponentTeamName: string;
  wasHome: boolean;
  kickoffTime: string;
  /** fpl's 1 to 5 rating of the fixture from this player's side */
  fixtureDifficulty: number;

  totalPoints: number;
  minutes: number;
  /** 1 if the player started; null in data that doesn't record it */
  starts: number | null;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  bonus: number;
  bps: number;
  /** fpl's expected stats; null where the source has none */
  expectedGoals: number | null;
  expectedAssists: number | null;
  expectedGoalsConceded: number | null;
  /**
   * fpl's defensive contribution count for the player's position. null in
   * seasons that didn't score it (before 2025-26), so 0 always means a real 0
   */
  defensiveContribution: number | null;
  /** fpl cost units at kickoff: 55 means £5.5m */
  nowCost: number;

  /**
   * kept apart from the real features on purpose. vaastav's xP is a snapshot
   * of fpl's ep_this, and the archive doesn't say when it was taken, so it may
   * have seen team news or even the result. use only as a baseline, never as a
   * model input
   */
  leaky: {
    fplExpectedPoints: number | null;
  };

  source: DatasetSource;
}

/** rows left out on purpose; anything unexpected throws instead */
export type DropReason = 'assistant-manager' | 'unfinished-fixture' | 'exact-duplicate';

export const DROP_REASON_LABEL: Record<DropReason, string> = {
  'assistant-manager': 'assistant manager entry (2024-25 chip), not a player',
  'unfinished-fixture': 'fixture not finished yet',
  'exact-duplicate': 'exact copy of another row',
};

export interface NormalisedSeason {
  season: string;
  rows: PlayerGameweekRow[];
  dropped: Partial<Record<DropReason, number>>;
}

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetValidationError';
  }
}

/**
 * a double gameweek is fine; the same player in the same fixture twice is not.
 * vaastav's 2025-26 file repeats a few rows word for word, so exact copies are
 * dropped and counted. two rows that disagree mean the data can't be trusted
 */
export function dropExactDuplicates(
  rows: readonly PlayerGameweekRow[],
  dropped: Partial<Record<DropReason, number>>,
): PlayerGameweekRow[] {
  const seen = new Map<string, string>();
  const unique: PlayerGameweekRow[] = [];
  for (const row of rows) {
    const key = `${row.season}/${row.playerId}/${row.fixtureId}`;
    const content = JSON.stringify(row);
    const earlier = seen.get(key);
    if (earlier === undefined) {
      seen.set(key, content);
      unique.push(row);
    } else if (earlier === content) {
      countDrop(dropped, 'exact-duplicate');
    } else {
      throw new DatasetValidationError(
        `conflicting rows: player ${row.playerId} in fixture ${row.fixtureId} of ${row.season} appears twice with different stats`,
      );
    }
  }
  return unique;
}

/**
 * fpl only began publishing expected stats in gameweek 16 of 2022-23, and
 * vaastav keeps the gameweeks before that as 0 rather than blank. a gameweek
 * where goals were scored but every expected stat is 0 had none published, so
 * its expected stats become null instead of a false 0
 */
export function blankUnpublishedExpectedStats(
  rows: readonly PlayerGameweekRow[],
): PlayerGameweekRow[] {
  const published = new Set<number>();
  const scored = new Set<number>();
  for (const row of rows) {
    if (row.goalsScored > 0) scored.add(row.gameweek);
    if (
      (row.expectedGoals ?? 0) !== 0 ||
      (row.expectedAssists ?? 0) !== 0 ||
      (row.expectedGoalsConceded ?? 0) !== 0
    ) {
      published.add(row.gameweek);
    }
  }
  return rows.map((row) =>
    published.has(row.gameweek) || !scored.has(row.gameweek)
      ? row
      : {
          ...row,
          expectedGoals: null,
          expectedAssists: null,
          expectedGoalsConceded: null,
        },
  );
}

export function countDrop(
  dropped: Partial<Record<DropReason, number>>,
  reason: DropReason,
): void {
  dropped[reason] = (dropped[reason] ?? 0) + 1;
}
