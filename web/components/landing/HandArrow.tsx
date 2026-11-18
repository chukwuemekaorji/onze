import { motion } from 'motion/react';
import { useDrawIn } from '../../motion.js';
import { INK_WOBBLE_FILTER } from '../ui/InkFilters.js';

// a quick pen arrow curling up and to the left, head at the top left
const SHAFT = 'M 62 40 C 50 42, 30 38, 18 14';
const HEAD = 'M 10 22 L 17 12 L 28 17';

interface HandArrowProps {
  className: string;
  delayS?: number;
}

/** a hand-drawn arrow that draws itself in once it's in view */
export function HandArrow({ className, delayS = 0 }: HandArrowProps) {
  const shaft = useDrawIn(delayS);
  const head = useDrawIn(delayS + 0.35);
  return (
    <svg className={className} viewBox="0 0 70 48" aria-hidden="true" focusable="false">
      <motion.path d={SHAFT} filter={INK_WOBBLE_FILTER} {...shaft} />
      <motion.path d={HEAD} filter={INK_WOBBLE_FILTER} {...head} />
    </svg>
  );
}
