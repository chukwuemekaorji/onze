import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useHighlighterSwipe } from '../../motion.js';

interface HighlightProps {
  children: ReactNode;
  delayS?: number;
}

/** a highlighter pass behind inline text. wraps across lines cleanly */
export function Highlight({ children, delayS = 0 }: HighlightProps) {
  const swipe = useHighlighterSwipe(delayS);
  return (
    <motion.mark className="ui-highlight" {...swipe}>
      {children}
    </motion.mark>
  );
}
