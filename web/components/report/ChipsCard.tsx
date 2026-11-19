import { motion } from 'motion/react';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { usePrefersReducedMotion } from '../../motion.js';
import { chipStamps } from '../../report-view.js';
import { PaperCard } from '../ui/PaperCard.js';
import { CoachNote } from './CoachNote.js';

// once the tab has faded in, the stamp comes down and the strikes draw
const STAMP_DELAY_S = 0.3;
const STAMP_S = 0.45;
const STRIKE_S = 0.5;
// the stamp lands big and slightly crooked, squashes, then settles flat
const STAMP_START_SCALE = 1.7;
const STAMP_SQUASH_SCALE = 0.94;
const STAMP_START_TILT_DEG = -8;

// a quick marker line across the chip's name, with a little wobble
const STRIKE_PATH = 'M 2 9 C 30 6, 60 11, 98 7';

interface ChipsCardProps {
  summary: AnalysisSummary;
  note: string | null;
}

export function ChipsCard({ summary, note }: ChipsCardProps) {
  const stamps = chipStamps(summary.chipsUsed, summary.chips.suggestions);
  // these play every time the tab mounts, which is once per visit
  const animate = !usePrefersReducedMotion();

  return (
    <PaperCard as="section" className="report-card" aria-labelledby="chips-heading">
      <h3 id="chips-heading" className="report-card__title">
        Your chips
      </h3>
      <ul className="chip-stamps">
        {stamps.map((stamp) => (
          <li key={stamp.chip} className={`chip-stamp chip-stamp--${stamp.state}`}>
            <span className="chip-stamp__name">
              {stamp.label}
              {stamp.state === 'used' && (
                <svg
                  className="chip-stamp__strike"
                  viewBox="0 0 100 16"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <motion.path
                    d={STRIKE_PATH}
                    {...(animate && {
                      initial: { pathLength: 0 },
                      animate: { pathLength: 1 },
                      transition: { delay: STAMP_DELAY_S, duration: STRIKE_S },
                    })}
                  />
                </svg>
              )}
            </span>
            {stamp.state === 'recommended' ? (
              <motion.span
                className="chip-stamp__verdict chip-stamp__verdict--stamped"
                {...(animate && {
                  initial: {
                    opacity: 0,
                    scale: STAMP_START_SCALE,
                    rotate: STAMP_START_TILT_DEG,
                  },
                  animate: {
                    opacity: [0, 1, 1],
                    scale: [STAMP_START_SCALE, STAMP_SQUASH_SCALE, 1],
                    rotate: [STAMP_START_TILT_DEG, 0, 0],
                  },
                  transition: {
                    delay: STAMP_DELAY_S,
                    duration: STAMP_S,
                    times: [0, 0.6, 1],
                    ease: 'easeOut' as const,
                  },
                })}
              >
                {stamp.verdict}
              </motion.span>
            ) : (
              <span className="chip-stamp__verdict">{stamp.verdict}</span>
            )}
          </li>
        ))}
      </ul>
      {note !== null && <CoachNote text={note} />}
    </PaperCard>
  );
}
