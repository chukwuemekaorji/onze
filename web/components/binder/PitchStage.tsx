import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { nextEraserPhase } from '../../eraser-phase.js';
import type { EraserEvent, EraserPhase } from '../../eraser-phase.js';
import { usePrefersReducedMotion } from '../../motion.js';
import { useReportStage } from '../../report-stage.js';
import { PencilLoader } from '../PencilLoader.js';
import { Pitch } from '../Pitch.js';

const WIPE_S = 0.7;
const REVEAL_S = 0.3;
const RESTORE_S = 0.45;

// the clean paper the eraser leaves: covering while it wipes and waits, fading
// to reveal a new pitch, or shrinking back to give the old one back
const COVERED = { scaleX: 1, opacity: 1 };
const SHEET_TARGET: Record<
  Exclude<EraserPhase, 'idle'>,
  { scaleX: number; opacity: number }
> = {
  wiping: COVERED,
  'wiping-then-reveal': COVERED,
  'wiping-then-restore': COVERED,
  erased: COVERED,
  revealing: { scaleX: 1, opacity: 0 },
  restoring: { scaleX: 0, opacity: 1 },
};

interface PitchStageProps {
  summary: AnalysisSummary;
}

/**
 * the pitch, plus the eraser that wipes it while a refresh runs. the pitch keeps
 * the team it had until the eraser reveals the new one, which then remounts
 * under a fresh entrance key so it draws itself in again
 */
export function PitchStage({ summary }: PitchStageProps) {
  const { refreshing, refreshCount } = useReportStage();
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<EraserPhase>('idle');
  const lastRefreshCount = useRef(refreshCount);
  const [shownPitch, setShownPitch] = useState({ summary, count: refreshCount });

  function send(event: EraserEvent): void {
    setPhase((current) => nextEraserPhase(current, event));
  }

  useEffect(() => {
    if (refreshing) {
      send('refresh-started');
      return;
    }
    // a refresh just ended: it worked if the count moved on
    const succeeded = refreshCount !== lastRefreshCount.current;
    lastRefreshCount.current = refreshCount;
    send(succeeded ? 'refresh-succeeded' : 'refresh-failed');
  }, [refreshing, refreshCount]);

  // a new report (or an ai rewrite outside a refresh) shows once nothing covers it
  const canShowLatest = phase === 'idle' || phase === 'revealing';
  useEffect(() => {
    if (canShowLatest) setShownPitch({ summary, count: refreshCount });
  }, [canShowLatest, summary, refreshCount]);

  const isWiping = phase.startsWith('wiping');
  const durationS =
    isWiping || phase === 'erased'
      ? WIPE_S
      : phase === 'revealing'
        ? REVEAL_S
        : RESTORE_S;

  return (
    <div className="pitch-stage">
      <Pitch
        key={shownPitch.count}
        summary={shownPitch.summary}
        entranceKey={`pitch-${shownPitch.count}`}
      />
      {phase !== 'idle' && (
        <div className="eraser" aria-hidden={isWiping}>
          {/* transform and opacity only */}
          <motion.div
            className="eraser__sheet"
            // wiping grows from the left; restoring shrinks back toward the right
            style={{ originX: phase === 'restoring' ? 1 : 0 }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={SHEET_TARGET[phase]}
            transition={{ duration: reduced ? 0 : durationS, ease: 'easeInOut' }}
            onAnimationComplete={() => send(isWiping ? 'wipe-finished' : 'settled')}
          />
          {isWiping && !reduced && (
            // the eraser rides the leading edge of the clean paper
            <motion.div
              className="eraser__track"
              initial={{ x: '-100%' }}
              animate={{ x: '0%' }}
              transition={{ duration: WIPE_S, ease: 'easeInOut' }}
            >
              <span className="eraser__block" />
            </motion.div>
          )}
          {phase === 'erased' && (
            <div className="eraser__loading">
              <PencilLoader />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
