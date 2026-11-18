import { motion } from 'motion/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  CARD_DEAL_S,
  CARD_DEAL_STAGGER_S,
  CARD_DEAL_START_S,
  SETTLE_EASE,
  usePlayOnce,
} from '../../motion.js';

// cards land a little crooked and stay that way, like they were dealt by hand
const MAX_TILT_DEG = 1.2;
const DEAL_FROM_PX = 48;

interface DealtCardProps {
  /** position in the deal, which sets its delay */
  order: number;
  children: ReactNode;
}

export function DealtCard({ order, children }: DealtCardProps) {
  const deal = usePlayOnce(`report-card-${order}`);
  // picked once per mount, so a re-render never re-tilts the card
  const [tilt] = useState(() => (Math.random() * 2 - 1) * MAX_TILT_DEG);

  return (
    <motion.div
      className="dealt-card"
      initial={deal ? { opacity: 0, y: DEAL_FROM_PX, rotate: 0 } : false}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      transition={
        deal
          ? {
              delay: CARD_DEAL_START_S + order * CARD_DEAL_STAGGER_S,
              duration: CARD_DEAL_S,
              ease: SETTLE_EASE,
            }
          : { duration: 0 }
      }
    >
      {children}
    </motion.div>
  );
}
