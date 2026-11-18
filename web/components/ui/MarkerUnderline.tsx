import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useDrawIn } from '../../motion.js';
import { INK_WOBBLE_FILTER } from './InkFilters.js';

// one loose stroke that dips and recovers, like a quick pen underline
const UNDERLINE_PATH = 'M3 10 C 38 5, 74 13, 112 8 S 168 4, 197 9';

interface MarkerUnderlineProps {
  children: ReactNode;
  delayS?: number;
}

export function MarkerUnderline({ children, delayS = 0 }: MarkerUnderlineProps) {
  const drawIn = useDrawIn(delayS);
  return (
    <span className="ui-marker-underline">
      {children}
      <svg
        className="ui-marker-stroke ui-marker-underline__stroke"
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <motion.path d={UNDERLINE_PATH} filter={INK_WOBBLE_FILTER} {...drawIn} />
      </svg>
    </span>
  );
}
