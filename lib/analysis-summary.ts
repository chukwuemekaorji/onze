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
import type { LineupAnalysis } from './analysis/lineup.js';
import type { LeagueStanding, SquadContext } from './analysis/types.js';

export interface AnalysisSummary {
  managerName: string;
  teamName: string;
  currentEvent: number;
  /** ISO timestamp of the target gameweek's transfer deadline. */
  currentEventDeadline: string;
  /** The following gameweek, if the season isn't over. */
  nextEvent: { id: number; deadline: string } | null;
  /** ISO timestamp of when this report was generated (server time). */
  generatedAt: string;
  squad: SquadContext;
  /** The manager's own classic mini-leagues (FPL's system leagues like Overall/country are excluded). Empty if they haven't joined any. */
  leagueStandings: LeagueStanding[];
  chipsUsed: ChipName[];
  transfers: TransfersAnalysis;
  captaincy: CaptaincyAnalysis;
  chips: ChipsAnalysis;
  priceAlerts: PriceAlertsAnalysis;
  /** Recommended starting XI/formation for currentEvent, assuming the transfer above (if any) is made. */
  lineup: LineupAnalysis;
}
