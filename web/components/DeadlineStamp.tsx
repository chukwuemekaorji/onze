import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import {
  describeCountdown,
  formatCountdown,
  formatDeadlineDate,
  upcomingDeadline,
} from '../deadline.js';
import { useNow } from '../use-now.js';

interface DeadlineStampProps {
  summary: AnalysisSummary;
}

/** a rubber-stamped countdown to the next deadline that's still open */
export function DeadlineStamp({ summary }: DeadlineStampProps) {
  const now = useNow();
  const upcoming = upcomingDeadline(summary, now);

  if (!upcoming) {
    return (
      <div className="deadline-stamp deadline-stamp--closed">
        <span className="deadline-stamp__label">Deadline passed</span>
      </div>
    );
  }

  const label = upcoming.isNextGameweek ? `GW${upcoming.event} deadline` : 'Deadline';
  return (
    <div className="deadline-stamp">
      <span className="deadline-stamp__label">{label}</span>
      {/* the visible digits tick, so screen readers get a steady sentence instead */}
      <span className="deadline-stamp__countdown" aria-hidden="true">
        {formatCountdown(upcoming.msLeft)}
      </span>
      <span className="sr-only">in {describeCountdown(upcoming.msLeft)},</span>
      <time className="deadline-stamp__date" dateTime={upcoming.deadline}>
        {formatDeadlineDate(upcoming.deadline)}
      </time>
    </div>
  );
}
