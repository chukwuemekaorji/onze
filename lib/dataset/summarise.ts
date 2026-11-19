import type { DropReason, NormalisedSeason } from './player-gameweek.js';

export interface SeasonSummary {
  season: string;
  gameweeks: number;
  firstGameweek: number | null;
  lastGameweek: number | null;
  players: number;
  rows: number;
  /** rows that played at least a minute; the rest are squad players who didn't come on */
  rowsWithMinutes: number;
  dropped: Partial<Record<DropReason, number>>;
}

export function summariseSeason({
  season,
  rows,
  dropped,
}: NormalisedSeason): SeasonSummary {
  const gameweeks = new Set(rows.map((row) => row.gameweek));
  const sorted = [...gameweeks].sort((a, b) => a - b);
  return {
    season,
    gameweeks: gameweeks.size,
    firstGameweek: sorted[0] ?? null,
    lastGameweek: sorted.at(-1) ?? null,
    players: new Set(rows.map((row) => row.playerId)).size,
    rows: rows.length,
    rowsWithMinutes: rows.filter((row) => row.minutes > 0).length,
    dropped,
  };
}
