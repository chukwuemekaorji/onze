import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';
import type { HistoryView, PlayerTarget } from './snapshot.js';

/**
 * a model as the harness sees it: a target and the past in, expected points
 * for the gameweek out. null means it has nothing to say for this player (fpl's
 * xP where the source has none), and that gameweek is left unscored for it
 */
export interface Projector {
  id: string;
  label: string;
  describe: string;
  project(target: PlayerTarget, history: HistoryView): number | null;
}

/**
 * the prior when a player has no rows yet this season: every player in
 * gameweek 1, and anyone who signs mid-season. earlier seasons can't fill the
 * gap because fpl reuses player ids each season and the archive has no stable
 * id to join on. so in gameweek 1 every history baseline equals the constant
 */
export const NO_HISTORY_POINTS_PER_FIXTURE = 2;

// fpl's form: average points per match over the club's matches in the last 30 days
export const FORM_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_GAMEWEEKS = 3;

export const fplExpectedPoints: Projector = {
  id: 'fpl-xp',
  label: "FPL's xP (leaky)",
  describe:
    "fpl's own ep_this from vaastav's archive. may have seen team news or the result",
  project: (target) => target.leaky.fplExpectedPoints,
};

export const form: Projector = {
  id: 'form',
  label: 'Form (30 days)',
  describe:
    "fpl's definition: mean points per club match kicked off in the 30 days before the gameweek, 0 if none",
  project: (target, history) =>
    perFixture(target, history, (rows) => {
      const windowStart = Date.parse(history.firstKickoff) - FORM_WINDOW_DAYS * DAY_MS;
      const recent = rows.filter((row) => Date.parse(row.kickoffTime) >= windowStart);
      return recent.length === 0 ? 0 : meanPoints(recent);
    }),
};

export const pointsPerGame: Projector = {
  id: 'ppg',
  label: 'Points per game',
  describe: "fpl's definition: points this season over matches with minutes, 0 if none",
  project: (target, history) =>
    perFixture(target, history, (rows) => {
      const appearances = rows.filter((row) => row.minutes > 0);
      return appearances.length === 0 ? 0 : totalPoints(rows) / appearances.length;
    }),
};

export const lastThreeGameweeks: Projector = {
  id: 'last-3',
  label: `Last ${RECENT_GAMEWEEKS} gameweeks`,
  describe: `mean points per match over the player's last ${RECENT_GAMEWEEKS} gameweeks with a fixture, benched ones included`,
  project: (target, history) =>
    perFixture(target, history, (rows) => {
      const gameweeks = [...new Set(rows.map((row) => row.gameweek))].slice(
        -RECENT_GAMEWEEKS,
      );
      return meanPoints(rows.filter((row) => gameweeks.includes(row.gameweek)));
    }),
};

export const constantTwo: Projector = {
  id: 'constant-2',
  label: 'Constant 2',
  describe: `${NO_HISTORY_POINTS_PER_FIXTURE} points per fixture for everyone: the simplest possible guess`,
  project: (target) => NO_HISTORY_POINTS_PER_FIXTURE * target.fixtures.length,
};

export const BASELINES: readonly Projector[] = [
  fplExpectedPoints,
  form,
  pointsPerGame,
  lastThreeGameweeks,
  constantTwo,
];

/**
 * each history baseline gives points per match; a double gameweek doubles it.
 * a player with no rows yet gets the prior instead
 */
function perFixture(
  target: PlayerTarget,
  history: HistoryView,
  pointsPerMatch: (rows: readonly PlayerGameweekRow[]) => number,
): number {
  const rows = history.playerRows(target.playerId);
  const rate = rows.length === 0 ? NO_HISTORY_POINTS_PER_FIXTURE : pointsPerMatch(rows);
  return rate * target.fixtures.length;
}

function totalPoints(rows: readonly PlayerGameweekRow[]): number {
  return rows.reduce((sum, row) => sum + row.totalPoints, 0);
}

function meanPoints(rows: readonly PlayerGameweekRow[]): number {
  return rows.length === 0 ? 0 : totalPoints(rows) / rows.length;
}
