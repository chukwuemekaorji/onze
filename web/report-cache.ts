import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import type { ReportSource } from './report-writer.js';

// skips the fpl fetch and llm call on reload. dropped once the deadline passes,
// since the advice is stale by then
// v3 adds points per game, player status and the gameweek price labels; older
// entries are ignored rather than migrated
const REPORT_CACHE_PREFIX = 'sensei:report:v3:';

export interface CachedReport {
  report: CoachReport;
  analysisSummary: AnalysisSummary;
  source: ReportSource;
  cachedAt: number;
}

export function loadCachedReport(managerId: number): CachedReport | null {
  try {
    const raw = localStorage.getItem(REPORT_CACHE_PREFIX + managerId);
    return raw ? (JSON.parse(raw) as CachedReport) : null;
  } catch {
    return null;
  }
}

export function storeCachedReport(managerId: number, entry: CachedReport): void {
  try {
    localStorage.setItem(REPORT_CACHE_PREFIX + managerId, JSON.stringify(entry));
  } catch {
    // storage unavailable, skip caching
  }
}

export function isCacheStale(cached: CachedReport, now: number = Date.now()): boolean {
  const deadline = new Date(cached.analysisSummary.currentEventDeadline).getTime();
  return Number.isFinite(deadline) && now > deadline;
}
