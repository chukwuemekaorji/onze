import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { MotionProps, Transition } from 'motion/react';

// every motion animation goes through these so prefers-reduced-motion is never missed.
// <MotionConfig reducedMotion="user"> in main.tsx is the backstop, but it only
// stops transforms, not things like pathLength or backgroundSize

const DRAW_IN_DURATION_S = 0.7;
const SWIPE_DURATION_S = 0.45;
// hand-drawn strokes start slow, rush through the middle and settle
const MARKER_EASE: NonNullable<Transition['ease']> = [0.65, 0, 0.35, 1];
// how much of the element must be on screen before it draws
const IN_VIEW_AMOUNT = 0.6;
// motion can't tween a var() inside background-size, so this mirrors .ui-highlight
const HIGHLIGHT_HEIGHT = '62%';

type EntranceProps = Pick<
  MotionProps,
  'initial' | 'whileInView' | 'viewport' | 'transition'
>;

export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() === true;
}

/** a marker stroke drawing itself in once it scrolls into view */
export function useDrawIn(delayS = 0): EntranceProps {
  const reduced = usePrefersReducedMotion();
  if (reduced) return {};
  return {
    // opacity too, or the round line cap shows as a dot before the stroke starts
    initial: { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: IN_VIEW_AMOUNT },
    transition: {
      pathLength: { duration: DRAW_IN_DURATION_S, ease: MARKER_EASE, delay: delayS },
      opacity: { duration: 0.01, delay: delayS },
    },
  };
}

/** a highlighter dragged left to right across inline text */
export function useHighlighterSwipe(delayS = 0): EntranceProps {
  const reduced = usePrefersReducedMotion();
  if (reduced) return {};
  return {
    initial: { backgroundSize: `0% ${HIGHLIGHT_HEIGHT}` },
    whileInView: { backgroundSize: `100% ${HIGHLIGHT_HEIGHT}` },
    viewport: { once: true, amount: IN_VIEW_AMOUNT },
    transition: { duration: SWIPE_DURATION_S, ease: MARKER_EASE, delay: delayS },
  };
}

// entrance timeline for the report, in seconds. the pitch draws first, then
// the shirts land one by one; the cards are dealt alongside
export const PITCH_DRAW_S = 1.2;
export const JERSEY_FIRST_DELAY_S = PITCH_DRAW_S;
export const JERSEY_STAGGER_S = 0.07;
export const JERSEY_SLAP_S = 0.4;
export const CARD_DEAL_START_S = 0.3;
export const CARD_DEAL_STAGGER_S = 0.14;
export const CARD_DEAL_S = 0.5;
export const STAMP_THUMP_DELAY_S = 0.2;

/** a quick overshoot then settle, for things landing on the table */
export const SETTLE_EASE: NonNullable<Transition['ease']> = [0.2, 0.9, 0.3, 1];

// entrances already played in this page load. module scope, so a remount or a
// refreshed report never replays them
const entrancesPlayed = new Set<string>();

/**
 * true only the first time an entrance mounts in this page load, and never
 * with reduced motion, where everything starts in its final state
 */
export function usePlayOnce(entranceKey: string): boolean {
  const reduced = usePrefersReducedMotion();
  // read once per mount; strict mode's double render sees the same answer
  const [firstTime] = useState(() => !entrancesPlayed.has(entranceKey));
  useEffect(() => {
    entrancesPlayed.add(entranceKey);
  }, [entranceKey]);
  return firstTime && !reduced;
}
