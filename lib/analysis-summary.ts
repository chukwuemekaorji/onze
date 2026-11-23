/**
 * one shape for all three writers and for chat (the client resends it),
 * which is what keeps the writers interchangeable.
 */

import type { TransfersAnalysis } from './analysis/transfers.js';
import type { CaptaincyAnalysis } from './analysis/captaincy.js';
import type { ChipsAnalysis, ChipName } from './analysis/chips.js';
import type { PriceAlertsAnalysis } from './analysis/price-alerts.js';
import type { LineupAnalysis } from './analysis/lineup.js';
import type { TransferPlan } from './analysis/planner.js';
import type { LeagueStanding, SquadContext } from './analysis/types.js';

export interface AnalysisSummary {
  managerName: string;
  teamName: string;
  currentEvent: number;
  /** iso timestamp of the target gameweek's deadline */
  currentEventDeadline: string;
  /** null once the season is over */
  nextEvent: { id: number; deadline: string } | null;
  /** iso timestamp, server time */
  generatedAt: string;
  squad: SquadContext;
  /** leagues the manager joined; fpl system leagues are excluded */
  leagueStandings: LeagueStanding[];
  chipsUsed: ChipName[];
  transfers: TransfersAnalysis;
  /** the next few gameweeks' transfers, planned together; this week's advice stays in transfers */
  plan: TransferPlan;
  captaincy: CaptaincyAnalysis;
  chips: ChipsAnalysis;
  priceAlerts: PriceAlertsAnalysis;
  /** assumes the recommended transfers are made */
  lineup: LineupAnalysis;
}
