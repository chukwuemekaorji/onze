import type { AnalysisPlayer } from './types.js';

export type PriceDirection = 'rise' | 'fall';
export type PriceAlertStatus = 'changed_today' | 'predicted';

export interface PriceAlert {
  player: AnalysisPlayer;
  direction: PriceDirection;
  status: PriceAlertStatus;
}

export interface PriceAlertsAnalysis {
  alerts: PriceAlert[];
}

// community heuristic: fpl's price algorithm is secret, so this is a signal,
// never a guarantee
const NET_TRANSFER_RISE_THRESHOLD = 50_000;
const NET_TRANSFER_FALL_THRESHOLD = -50_000;

export function analyzePriceAlerts(players: AnalysisPlayer[]): PriceAlertsAnalysis {
  const alerts: PriceAlert[] = [];

  for (const player of players) {
    if (player.costChangeEvent !== 0) {
      alerts.push({
        player,
        direction: player.costChangeEvent > 0 ? 'rise' : 'fall',
        status: 'changed_today',
      });
      continue; // already moved today; don't also flag it as "predicted"
    }

    const netTransfers = player.transfersInEvent - player.transfersOutEvent;
    if (netTransfers >= NET_TRANSFER_RISE_THRESHOLD) {
      alerts.push({ player, direction: 'rise', status: 'predicted' });
    } else if (netTransfers <= NET_TRANSFER_FALL_THRESHOLD) {
      alerts.push({ player, direction: 'fall', status: 'predicted' });
    }
  }

  return { alerts };
}
