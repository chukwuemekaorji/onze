import { projectEvents } from '../analysis/event-projection.js';
import type { EventWeights, PointsBreakdown } from '../analysis/event-projection.js';
import { eventPoints, otherPoints } from '../analysis/fpl-scoring.js';
import type { Position } from '../analysis/types.js';
import type { PlayerGameweekRow } from '../dataset/player-gameweek.js';
import { eventInputFor } from './event-projector.js';
import type { GameweekCase } from './snapshot.js';

export const BREAKDOWN_KEYS = [
  'appearance',
  'goals',
  'assists',
  'cleanSheet',
  'goalsConceded',
  'saves',
  'bonus',
  'other',
] as const satisfies readonly (keyof PointsBreakdown)[];

export interface Calibration {
  appearances: number;
  /** average projected points from each event, given the player got on */
  projected: PointsBreakdown;
  /** average points each event actually scored in those appearances */
  actual: PointsBreakdown;
}

/**
 * projected against actual, event by event, over the appearances only: a model
 * built from the scoring rules should match on each line, not just in total
 */
export function calibrationByPosition(
  folds: readonly {
    cases: readonly GameweekCase[];
    seasonRows: readonly PlayerGameweekRow[];
    weights: EventWeights;
  }[],
): Record<Position, Calibration> {
  const totals: Record<Position, Calibration> = {
    GK: empty(),
    DEF: empty(),
    MID: empty(),
    FWD: empty(),
  };
  for (const fold of folds) addFold(totals, fold.cases, fold.seasonRows, fold.weights);
  for (const total of Object.values(totals)) {
    for (const key of BREAKDOWN_KEYS) {
      total.projected[key] /= Math.max(1, total.appearances);
      total.actual[key] /= Math.max(1, total.appearances);
    }
  }
  return totals;
}

function addFold(
  totals: Record<Position, Calibration>,
  cases: readonly GameweekCase[],
  seasonRows: readonly PlayerGameweekRow[],
  weights: EventWeights,
): void {
  const rowByFixture = new Map(
    seasonRows.map((row) => [`${row.playerId}/${row.fixtureId}`, row]),
  );
  for (const { history, targets } of cases) {
    for (const target of targets) {
      const projection = projectEvents(eventInputFor(target, history), weights);
      target.fixtures.forEach((fixture, index) => {
        const row = rowByFixture.get(`${target.playerId}/${fixture.fixtureId}`);
        const projected = projection.fixtures[index]?.points;
        if (row === undefined || projected === undefined) {
          throw new Error(
            `no row for player ${target.playerId} in fixture ${fixture.fixtureId}`,
          );
        }
        if (row.minutes === 0) return;
        const actual: PointsBreakdown = {
          ...eventPoints(target.position, row),
          other: otherPoints(target.position, row),
        };
        const total = totals[target.position];
        total.appearances += 1;
        for (const key of BREAKDOWN_KEYS) {
          total.projected[key] += projected[key];
          total.actual[key] += actual[key];
        }
      });
    }
  }
}

function empty(): Calibration {
  const zero = (): PointsBreakdown => ({
    appearance: 0,
    goals: 0,
    assists: 0,
    cleanSheet: 0,
    goalsConceded: 0,
    saves: 0,
    bonus: 0,
    other: 0,
  });
  return { appearances: 0, projected: zero(), actual: zero() };
}
