import type { Projector } from './baselines.js';
import { bootstrapInterval } from './bootstrap.js';
import type { BootstrapOptions, Interval } from './bootstrap.js';
import { METRICS, metricValue, scoreGameweek } from './metrics.js';
import type { GameweekParts, MetricId, ScoredPlayer } from './metrics.js';
import type { GameweekCase } from './snapshot.js';

export interface GameweekResult {
  season: string;
  gameweek: number;
  players: number;
  parts: GameweekParts;
}

export interface Projection {
  season: string;
  gameweek: number;
  playerId: number;
  projected: number;
  actual: number;
  minutes: number;
}

export interface BacktestRun {
  projectorId: string;
  gameweeks: GameweekResult[];
  /** gameweeks where the projector returned null for someone, so it wasn't scored */
  unscoredGameweeks: number;
  projections: Projection[];
}

/**
 * the projector sees only each case's history and targets. outcomes are read
 * here, after it has answered, and never handed to it
 */
export function runBacktest(
  cases: readonly GameweekCase[],
  projector: Projector,
): BacktestRun {
  const run: BacktestRun = {
    projectorId: projector.id,
    gameweeks: [],
    unscoredGameweeks: 0,
    projections: [],
  };
  for (const { history, targets, outcomes } of cases) {
    const projected = targets.map((target) => projector.project(target, history));
    if (projected.some((value) => value === null)) {
      run.unscoredGameweeks += 1;
      continue;
    }
    const scored: ScoredPlayer[] = [];
    targets.forEach((target, index) => {
      const outcome = outcomes.get(target.playerId);
      if (outcome === undefined)
        throw new Error(`no outcome for player ${target.playerId}`);
      const projection = projected[index] ?? 0;
      scored.push({
        position: target.position,
        projected: projection,
        ...actualOf(outcome),
      });
      run.projections.push({
        season: history.season,
        gameweek: history.gameweek,
        playerId: target.playerId,
        projected: projection,
        ...actualOf(outcome),
      });
    });
    run.gameweeks.push({
      season: history.season,
      gameweek: history.gameweek,
      players: scored.length,
      parts: scoreGameweek(scored),
    });
  }
  return run;
}

export interface MetricSummary {
  id: MetricId;
  value: number | null;
  interval: Interval | null;
}

/** each metric pooled over the gameweeks, with a bootstrap interval over gameweeks */
export function summariseRun(
  gameweeks: readonly GameweekResult[],
  bootstrap: BootstrapOptions,
): MetricSummary[] {
  const parts = gameweeks.map((gameweek) => gameweek.parts);
  return METRICS.map(({ id }) => ({
    id,
    value: metricValue(id, parts),
    interval: bootstrapInterval(parts, (sample) => metricValue(id, sample), bootstrap),
  }));
}

function actualOf(outcome: { totalPoints: number; minutes: number }) {
  return { actual: outcome.totalPoints, minutes: outcome.minutes };
}
