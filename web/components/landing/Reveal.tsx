import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useRevealOnScroll } from '../../motion.js';

interface RevealProps {
  id?: string;
  className: string;
  labelledBy: string;
  children: ReactNode;
}

/** a landing section that fades up once as it scrolls into view */
export function Reveal({ id, className, labelledBy, children }: RevealProps) {
  const reveal = useRevealOnScroll();
  return (
    <motion.section
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      {...reveal}
    >
      {children}
    </motion.section>
  );
}
