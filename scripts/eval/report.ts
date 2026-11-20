import type { BacktestRun, MetricSummary } from '../../lib/eval/backtest.js';
import type { Projector } from '../../lib/eval/baselines.js';
import {
  FORM_WINDOW_DAYS,
  NO_HISTORY_POINTS_PER_FIXTURE,
} from '../../lib/eval/baselines.js';
import { CAPTAIN_POOL, METRICS, TOP_PICKS } from '../../lib/eval/metrics.js';
import type { MetricId } from '../../lib/eval/metrics.js';
import { EVAL_SPLITS } from '../../lib/eval/splits.js';

export interface BaselineReport {
  projector: Projector;
  run: BacktestRun;
  pooled: MetricSummary[];
  bySeason: { season: string; summary: MetricSummary[] }[];
}

export interface ReportContext {
  vaastavCommit: string;
  resamples: number;
  seed: number;
}

const DECIMALS = 2;

export function formatNumber(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(DECIMALS);
}

export function cell(summary: MetricSummary | undefined): string {
  if (summary === undefined || summary.value === null) return 'n/a';
  const interval = summary.interval;
  const range =
    interval === null
      ? ''
      : ` [${formatNumber(interval.low)}, ${formatNumber(interval.high)}]`;
  return `${formatNumber(summary.value)}${range}`;
}

export function find(
  summaries: readonly MetricSummary[],
  id: MetricId,
): MetricSummary | undefined {
  return summaries.find((summary) => summary.id === id);
}

export function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function arrow(better: 'lower' | 'higher'): string {
  return better === 'lower' ? '↓' : '↑';
}

export interface ScoreTables {
  pooled: string;
  perSeason: string;
}

/** the headline table (with intervals) and the per-season table, one row per projector */
export function scoreTables(
  reports: readonly BaselineReport[],
  firstColumn: string,
): ScoreTables {
  const metricHeader = METRICS.map(
    (metric) => `${metric.label} ${arrow(metric.better)}`,
  );
  return {
    pooled: table(
      [firstColumn, ...metricHeader],
      reports.map((report) => [
        report.projector.label,
        ...METRICS.map((metric) => cell(find(report.pooled, metric.id))),
      ]),
    ),
    perSeason: table(
      [firstColumn, 'Season', ...metricHeader],
      reports.flatMap((report) =>
        report.bySeason.map(({ season, summary }) => [
          report.projector.label,
          season,
          ...METRICS.map((metric) =>
            formatNumber(find(summary, metric.id)?.value ?? null),
          ),
        ]),
      ),
    ),
  };
}

/** the scope line shared by every results file */
export function scopeLine(
  reports: readonly BaselineReport[],
  context: ReportContext,
): string {
  const first = reports[0];
  const gameweekCount = first?.run.gameweeks.length ?? 0;
  const playerGameweeks = first?.run.projections.length ?? 0;
  return `Tune seasons ${EVAL_SPLITS.tune.join(' and ')}: ${gameweekCount} gameweeks, ${playerGameweeks} player-gameweeks. ${EVAL_SPLITS.test.join(', ')} is the locked test season and is not scored here. Data: vaastav/Fantasy-Premier-League at \`${context.vaastavCommit.slice(0, 7)}\`.

Each cell is the value over both seasons and a 95% bootstrap interval (${context.resamples} resamples of whole gameweeks, seed ${context.seed}). ↓ lower is better, ↑ higher is better.`;
}

export const MEASUREMENT_NOTES = `- A model predicting gameweek N sees only rows from earlier gameweeks and earlier seasons. It is handed the player, price and fixtures for N, never the result.
- **MAE / RMSE, played**: over player-gameweeks with minutes > 0. **Everyone**: every player whose team had a fixture, including those who didn't play.
- **Spearman, by position**: rank correlation of projected vs actual within each position in each gameweek, averaged over those groups. It covers everyone with a fixture, so it rewards knowing who will play as well as who will score. Ties count: a model that gives unused players exactly 0 matches their actual 0s and gains here. **Spearman, played** is the same over players who got on, so it measures who scores without who plays.
- **Top-${TOP_PICKS} hit**: average actual points of the ${TOP_PICKS} highest-projected players in a gameweek.
- **Captain regret**: best actual score among the top ${CAPTAIN_POOL} projected, minus the actual score of the top projected player.
- Ties in a projection are never broken by player id: tied players share the tied group's average. So the constant's top-${TOP_PICKS} is the average player, and its Spearman only reflects double gameweeks (two fixtures project 4, one projects 2).
- A double gameweek is one prediction with both fixtures' points summed.`;

export function describeProjectors(reports: readonly BaselineReport[]): string {
  return reports
    .map(
      (report) =>
        `- **${report.projector.label}**: ${sentence(report.projector.describe)}.`,
    )
    .join('\n');
}

/** the committed results/baselines.md: method first, then the numbers */
export function formatMarkdown(
  reports: readonly BaselineReport[],
  context: ReportContext,
): string {
  const { pooled, perSeason } = scoreTables(reports, 'Baseline');
  return `# Baselines

Generated by \`npm run eval:baselines\`. Don't edit by hand.

${scopeLine(reports, context)}

${pooled}

## Per season

${perSeason}

## How it's measured

${MEASUREMENT_NOTES}

## Baselines

${describeProjectors(reports)}

Early gameweeks: a player with no rows yet this season (everyone in gameweek 1, and mid-season signings) gets ${NO_HISTORY_POINTS_PER_FIXTURE} points per fixture. The baselines deliberately ignore last season; starting from it is the projection model's job (see projection.md). So in gameweek 1 every history baseline equals the constant. A player with rows but none in the last ${FORM_WINDOW_DAYS} days has form 0, as on FPL. FPL's xP is a snapshot that may have seen team news or the result, so treat it as a ceiling to chase, not a fair rival.
`;
}
