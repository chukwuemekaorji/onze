import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useDrawIn } from '../../motion.js';
import { INK_WOBBLE_FILTER } from './InkFilters.js';

// a loop that overshoots its start, the way a coach rings a name on the board
const CIRCLE_PATH =
  'M128 9 C 70 4, 14 14, 8 40 C 3 63, 52 76, 104 74 C 158 72, 197 58, 193 34 C 189 12, 140 3, 62 13';

interface MarkerCircleProps {
  children: ReactNode;
  delayS?: number;
}

export function MarkerCircle({ children, delayS = 0 }: MarkerCircleProps) {
  const drawIn = useDrawIn(delayS);
  return (
    <span className="ui-marker-circle">
      {children}
      <svg
        className="ui-marker-stroke ui-marker-circle__stroke"
        viewBox="0 0 200 80"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <motion.path d={CIRCLE_PATH} filter={INK_WOBBLE_FILTER} {...drawIn} />
      </svg>
    </span>
  );
}
