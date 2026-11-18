import type { AnalysisSummary } from '../lib/analysis-summary.js';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

export function formatDeadline(iso: string): string {
  if (!iso) return 'unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatUpdatedAt(cachedAt: number, now: number = Date.now()): string {
  const minutesAgo = Math.round((now - cachedAt) / MS_PER_MINUTE);
  if (minutesAgo < 1) return 'just now';
  if (minutesAgo === 1) return '1 minute ago';
  if (minutesAgo < MINUTES_PER_HOUR) return `${minutesAgo} minutes ago`;
  const hoursAgo = Math.round(minutesAgo / MINUTES_PER_HOUR);
  return hoursAgo === 1 ? '1 hour ago' : `${hoursAgo} hours ago`;
}

export function describeGameweek(summary: AnalysisSummary, cachedAt: number): string {
  const parts = [
    `GW${summary.currentEvent} deadline: ${formatDeadline(summary.currentEventDeadline)}`,
    `Updated ${formatUpdatedAt(cachedAt)}`,
  ];
  if (summary.nextEvent) {
    parts.push(
      `Next: GW${summary.nextEvent.id}, ${formatDeadline(summary.nextEvent.deadline)}`,
    );
  }
  return parts.join(' · ');
}
