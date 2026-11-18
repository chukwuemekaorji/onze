import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  CARD_DEAL_S,
  CARD_DEAL_STAGGER_S,
  CARD_DEAL_START_S,
  SETTLE_EASE,
  usePlayOnce,
} from '../../motion.js';
import { stableTilt } from '../../stable-tilt.js';

// cards sit a little crooked, like they were dealt by hand
const MAX_TILT_DEG = 1.2;
const DEAL_FROM_PX = 48;

interface DealtCardProps {
  /** names the card; it fixes the tilt and the once-per-load entrance */
  cardKey: string;
  /** position in the deal, which sets its delay */
  order: number;
  /** false on tab pages, which arrive with the page flip instead */
  dealt?: boolean;
  children: ReactNode;
}

export function DealtCard({ cardKey, order, dealt = true, children }: DealtCardProps) {
  const firstDeal = usePlayOnce(`report-card-${cardKey}`);
  const deal = dealt && firstDeal;
  const tilt = stableTilt(cardKey, MAX_TILT_DEG);

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
