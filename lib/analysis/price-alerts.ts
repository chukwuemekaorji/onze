import type { AnalysisPlayer } from './types.js';

export type PriceDirection = 'rise' | 'fall';

/**
 * changed_this_gameweek: the price already moved since the gameweek opened.
 * demand_this_gameweek: heavy net buying or selling this gameweek, a sign a move
 * may follow. fpl only publishes transfer totals for the whole gameweek, never
 * per day, so neither is a prediction of tonight's change
 */
export type PriceAlertStatus = 'changed_this_gameweek' | 'demand_this_gameweek';

export interface PriceAlert {
  player: AnalysisPlayer;
  direction: PriceDirection;
  status: PriceAlertStatus;
}

export interface PriceAlertsAnalysis {
  alerts: PriceAlert[];
}

export interface AnalyzePriceAlertsOptions {
  /** days since the current gameweek opened; the transfer totals cover all of them */
  daysSinceGameweekOpened?: number | undefined;
}

// community heuristic for one day of net transfers: fpl's price algorithm is
// secret, so this is a signal, never a guarantee
const DAILY_NET_TRANSFER_THRESHOLD = 50_000;
// a gameweek that opened hours ago still counts as one day of transfers
const MIN_DAYS = 1;

export function analyzePriceAlerts(
  players: AnalysisPlayer[],
  options: AnalyzePriceAlertsOptions = {},
): PriceAlertsAnalysis {
  const days = Math.max(MIN_DAYS, options.daysSinceGameweekOpened ?? MIN_DAYS);
  const alerts: PriceAlert[] = [];

  for (const player of players) {
    // cost_change_event is the change since the gameweek opened, not today
    if (player.costChangeEvent !== 0) {
      alerts.push({
        player,
        direction: player.costChangeEvent > 0 ? 'rise' : 'fall',
        status: 'changed_this_gameweek',
      });
      continue;
    }

    // transfers_in_event and transfers_out_event are gameweek totals, so they're
    // averaged per day before meeting the daily threshold
    const dailyNet = (player.transfersInEvent - player.transfersOutEvent) / days;
    if (dailyNet >= DAILY_NET_TRANSFER_THRESHOLD) {
      alerts.push({ player, direction: 'rise', status: 'demand_this_gameweek' });
    } else if (dailyNet <= -DAILY_NET_TRANSFER_THRESHOLD) {
      alerts.push({ player, direction: 'fall', status: 'demand_this_gameweek' });
    }
  }

  return { alerts };
}
