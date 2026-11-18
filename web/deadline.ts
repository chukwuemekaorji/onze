import type { AnalysisSummary } from '../lib/analysis-summary.js';

export interface UpcomingDeadline {
  event: number;
  /** iso timestamp */
  deadline: string;
  msLeft: number;
  /** true once the report's own gameweek has locked and this is the one after */
  isNextGameweek: boolean;
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function msUntil(iso: string, now: number): number | null {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time - now : null;
}

/** the report's deadline while it's open, then the next gameweek's, then nothing */
export function upcomingDeadline(
  summary: Pick<AnalysisSummary, 'currentEvent' | 'currentEventDeadline' | 'nextEvent'>,
  now: number,
): UpcomingDeadline | null {
  const currentLeft = msUntil(summary.currentEventDeadline, now);
  if (currentLeft !== null && currentLeft > 0) {
    return {
      event: summary.currentEvent,
      deadline: summary.currentEventDeadline,
      msLeft: currentLeft,
      isNextGameweek: false,
    };
  }

  const next = summary.nextEvent;
  const nextLeft = next ? msUntil(next.deadline, now) : null;
  if (next && nextLeft !== null && nextLeft > 0) {
    return {
      event: next.id,
      deadline: next.deadline,
      msLeft: nextLeft,
      isNextGameweek: true,
    };
  }
  return null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "2d 04h 31m". rounds down, so it never claims more time than is left */
export function formatCountdown(msLeft: number): string {
  const totalMinutes = Math.max(0, Math.floor(msLeft / MS_PER_MINUTE));
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const hours = totalHours % HOURS_PER_DAY;
  const days = Math.floor(totalHours / HOURS_PER_DAY);
  return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
}

/** the same span spelled out, for screen readers */
export function describeCountdown(msLeft: number): string {
  const [days, hours, minutes] = formatCountdown(msLeft)
    .split(' ')
    .map((part) => parseInt(part, 10)) as [number, number, number];
  const unit = (value: number, name: string) =>
    `${value} ${name}${value === 1 ? '' : 's'}`;
  return `${unit(days, 'day')}, ${unit(hours, 'hour')} and ${unit(minutes, 'minute')}`;
}

export function formatDeadlineDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
