import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { AnalysisSummary } from '../../lib/analysis-summary.js';
import {
  describeCountdown,
  formatCountdown,
  formatDeadlineDate,
  upcomingDeadline,
} from '../deadline.js';
import { SETTLE_EASE, STAMP_THUMP_DELAY_S, usePlayOnce } from '../motion.js';
import { useNow } from '../use-now.js';

// inside the last hour the stamp pulses red
const URGENT_WITHIN_MS = 60 * 60 * 1000;

// the stamp presses down: a touch large, then flat. no tilt, no shake
const THUMP_START_SCALE = 1.12;
const THUMP_DURATION_S = 0.35;

interface DeadlineStampProps {
  summary: AnalysisSummary;
}

/** a rubber-stamped countdown to the next deadline that's still open */
export function DeadlineStamp({ summary }: DeadlineStampProps) {
  const now = useNow();
  const upcoming = upcomingDeadline(summary, now);

  if (!upcoming) {
    return (
      <StampFrame className="deadline-stamp deadline-stamp--closed">
        <span className="deadline-stamp__label">Deadline passed</span>
      </StampFrame>
    );
  }

  const label = upcoming.isNextGameweek ? `GW${upcoming.event} deadline` : 'Deadline';
  const urgent = upcoming.msLeft <= URGENT_WITHIN_MS;
  return (
    <StampFrame className={`deadline-stamp${urgent ? ' deadline-stamp--urgent' : ''}`}>
      <span className="deadline-stamp__label">{label}</span>
      {/* the visible digits tick, so screen readers get a steady sentence instead */}
      <span className="deadline-stamp__countdown" aria-hidden="true">
        {formatCountdown(upcoming.msLeft)}
      </span>
      <span className="sr-only">in {describeCountdown(upcoming.msLeft)},</span>
      <time className="deadline-stamp__date" dateTime={upcoming.deadline}>
        {formatDeadlineDate(upcoming.deadline)}
      </time>
    </StampFrame>
  );
}

function StampFrame({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const thump = usePlayOnce('deadline-stamp');
  const entrance = thump
    ? {
        initial: { opacity: 0, scale: THUMP_START_SCALE },
        animate: { opacity: 1, scale: 1 },
        transition: {
          delay: STAMP_THUMP_DELAY_S,
          duration: THUMP_DURATION_S,
          ease: SETTLE_EASE,
        },
      }
    : {};
  return (
    <motion.div className={className} {...entrance}>
      {children}
    </motion.div>
  );
}
