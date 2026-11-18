import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  CARD_DEAL_S,
  CARD_DEAL_STAGGER_S,
  CARD_DEAL_START_S,
  SETTLE_EASE,
  usePlayOnce,
} from '../../motion.js';

// a short rise into place; cards sit square on the page
const DEAL_FROM_PX = 14;

interface DealtCardProps {
  /** names the card for its once-per-load entrance */
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

  return (
    <motion.div
      className="dealt-card"
      initial={deal ? { opacity: 0, y: DEAL_FROM_PX } : false}
      animate={{ opacity: 1, y: 0 }}
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
