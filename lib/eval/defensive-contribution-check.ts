import {
  DEFENSIVE_CONTRIBUTION_POINTS,
  DEFENSIVE_CONTRIBUTION_THRESHOLD,
  defensiveContributionPoints,
} from '../analysis/fpl-scoring.js';
import { expectedDefensiveContributionPoints } from '../analysis/projection.js';
import type { Position } from '../analysis/types.js';
import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';
import { projectionInputFor } from './projection-projector.js';
import type { GameweekCase } from './snapshot.js';

/** one appearance: the chance the model gave of reaching the count, and whether it was */
export interface DefensiveContributionCall {
  gameweek: number;
  position: Position;
  minutes: number;
  chance: number;
  reached: boolean;
}

/**
 * every appearance by a player who can earn defensive contribution points,
 * with the chance the model gave before the deadline. the rule term only
 * applies once the player is on, so appearances are what it is checked on
 */
export function defensiveContributionCalls(
  cases: readonly GameweekCase[],
  seasonRows: readonly PlayerGameweekRow[],
): DefensiveContributionCall[] {
  const rowByFixture = new Map(
    seasonRows.map((row) => [`${row.playerId}/${row.fixtureId}`, row]),
  );
  const calls: DefensiveContributionCall[] = [];
  for (const { history, targets } of cases) {
    for (const target of targets) {
      if (DEFENSIVE_CONTRIBUTION_THRESHOLD[target.position] === null) continue;
      const chance =
        expectedDefensiveContributionPoints(projectionInputFor(target, history)) /
        DEFENSIVE_CONTRIBUTION_POINTS;
      for (const fixture of target.fixtures) {
        const row = rowByFixture.get(`${target.playerId}/${fixture.fixtureId}`);
        if (row === undefined) {
          throw new Error(
            `no row for player ${target.playerId} in fixture ${fixture.fixtureId}`,
          );
        }
        if (row.minutes === 0) continue;
        if (row.defensiveContribution === null) {
          throw new Error(
            `${row.season} has no defensive contribution counts to check`,
          );
        }
        calls.push({
          gameweek: row.gameweek,
          position: target.position,
          minutes: row.minutes,
          chance,
          reached:
            defensiveContributionPoints(target.position, row.defensiveContribution) > 0,
        });
      }
    }
  }
  return calls;
}

export interface CallSummary {
  appearances: number;
  /** average chance given, x 2 is the expected points */
  predicted: number;
  /** share that really reached the count */
  actual: number;
  brier: number;
}

export function summariseCalls(
  calls: readonly DefensiveContributionCall[],
): CallSummary {
  if (calls.length === 0) return { appearances: 0, predicted: 0, actual: 0, brier: 0 };
  const mean = (read: (call: DefensiveContributionCall) => number) =>
    calls.reduce((sum, call) => sum + read(call), 0) / calls.length;
  return {
    appearances: calls.length,
    predicted: mean((call) => call.chance),
    actual: mean((call) => (call.reached ? 1 : 0)),
    brier: mean((call) => (call.chance - (call.reached ? 1 : 0)) ** 2),
  };
}

/** brier of always guessing the given rate: the bar a real forecast has to clear */
export function constantBrier(
  calls: readonly DefensiveContributionCall[],
  rate: (call: DefensiveContributionCall) => number,
): number {
  if (calls.length === 0) return 0;
  return (
    calls.reduce((sum, call) => sum + (rate(call) - (call.reached ? 1 : 0)) ** 2, 0) /
    calls.length
  );
}

export const CHANCE_BANDS: readonly { low: number; high: number }[] = [
  { low: 0, high: 0.1 },
  { low: 0.1, high: 0.25 },
  { low: 0.25, high: 0.5 },
  { low: 0.5, high: 0.75 },
  { low: 0.75, high: 1.01 },
];

/** calibration: within each band of chances given, how often the count was reached */
export function callsByBand(
  calls: readonly DefensiveContributionCall[],
): { low: number; high: number; summary: CallSummary }[] {
  return CHANCE_BANDS.map((band) => ({
    ...band,
    summary: summariseCalls(
      calls.filter((call) => call.chance >= band.low && call.chance < band.high),
    ),
  }));
}
