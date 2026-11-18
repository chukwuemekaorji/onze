/**
 * The single shape produced by the analysis layer and consumed by every
 * writer (coach-prompt, chat-prompt, fallback-writer) and by api/chat.ts
 * (which the client resends on every follow-up question). Keeping one
 * shape here is what lets those three writers stay interchangeable.
 */

import type { TransfersAnalysis } from './analysis/transfers.js';
import type { CaptaincyAnalysis } from './analysis/captaincy.js';
import type { ChipsAnalysis, ChipName } from './analysis/chips.js';
import type { PriceAlertsAnalysis } from './analysis/price-alerts.js';
import type { SquadContext } from './analysis/types.js';

export interface AnalysisSummary {
  managerName: string;
  teamName: string;
  currentEvent: number;
  squad: SquadContext;
  chipsUsed: ChipName[];
  transfers: TransfersAnalysis;
  captaincy: CaptaincyAnalysis;
  chips: ChipsAnalysis;
  priceAlerts: PriceAlertsAnalysis;
}
