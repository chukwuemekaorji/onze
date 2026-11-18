/**
 * Orchestrates fetch -> build -> analyze into one AnalysisSummary. Shared
 * by api/coach.ts (the report) and api/lineup-image.ts (the squad PNG),
 * which both need the identical squad/transfer/lineup computation.
 */

import {
  getBootstrapStatic,
  getFixtures,
  getEntry,
  getEntryPicks,
  getEntryHistory,
} from './fpl-client.js';
import {
  buildPlayerPool,
  buildSquadContext,
  buildLeagueStandings,
  applyRecommendedTransfers,
  computeFreeTransfers,
} from './build-context.js';
import { analyzeTransfers } from './analysis/transfers.js';
import { analyzeCaptaincy } from './analysis/captaincy.js';
import { analyzeChips } from './analysis/chips.js';
import type { ChipName } from './analysis/chips.js';
import { analyzePriceAlerts } from './analysis/price-alerts.js';
import { analyzeLineup } from './analysis/lineup.js';
import type { AnalysisSummary } from './analysis-summary.js';

const LOOKAHEAD_EVENTS = 5;

// FPL's own short codes for chips used, from /entry/{id}/history/.
const FPL_CHIP_NAME_MAP: Record<string, ChipName> = {
  wildcard: 'wildcard',
  bboost: 'bench_boost',
  '3xc': 'triple_captain',
  freehit: 'free_hit',
};

export class NoCurrentGameweekError extends Error {}

export async function generateAnalysisSummary(
  managerId: number,
  requestedEvent?: number,
): Promise<AnalysisSummary> {
  const [bootstrap, fixtures] = await Promise.all([
    getBootstrapStatic(),
    getFixtures(),
  ]);

  // Picks only exist for a gameweek that has actually started — FPL 404s
  // on /entry/{id}/event/{gw}/picks/ for a future gameweek. So this can
  // NEVER follow requestedEvent; it always has to be the live gameweek,
  // even when the caller wants analysis for a different target event
  // (e.g. /api/lineup-image passing the report's planning event through
  // to stay in sync — that's a future gameweek once the current one's
  // deadline has passed, and its picks don't exist yet).
  const picksEvent =
    bootstrap.events.find((e) => e.is_current)?.id ??
    bootstrap.events.find((e) => e.is_next)?.id;

  if (!picksEvent) {
    throw new NoCurrentGameweekError(
      'Could not determine the current gameweek from FPL data.',
    );
  }

  // requestedEvent only ever chooses which gameweek transfer/captaincy/
  // lineup advice targets (planningEvent below). FPL keeps a gameweek
  // flagged is_current for its whole duration, even after its own
  // deadline has passed mid-gameweek, so without an explicit request the
  // default target is the soonest gameweek whose deadline hasn't passed
  // yet, not necessarily picksEvent. The squad itself (which 15 players
  // are owned) doesn't change between gameweeks except by transfer, so
  // reusing picksEvent's squad here is still accurate regardless.
  const now = Date.now();
  const nextActionableEvent = bootstrap.events.find(
    (e) => new Date(e.deadline_time).getTime() > now,
  );
  const planningEvent = requestedEvent ?? nextActionableEvent?.id ?? picksEvent;

  const planningEventInfo = bootstrap.events.find((e) => e.id === planningEvent);
  const followingEventInfo = bootstrap.events.find(
    (e) => e.id === planningEvent + 1,
  );

  const [entry, picks, history] = await Promise.all([
    getEntry(managerId),
    getEntryPicks(managerId, picksEvent),
    getEntryHistory(managerId),
  ]);

  const playerPool = buildPlayerPool(bootstrap, fixtures, {
    fromEvent: planningEvent,
    lookaheadEvents: LOOKAHEAD_EVENTS,
  });
  const freeTransfers = computeFreeTransfers(history, planningEvent);
  const squad = buildSquadContext(
    picks,
    playerPool,
    planningEvent,
    picks.entry_history.bank,
    freeTransfers,
  );

  const chipsUsed = history.chips
    .map((c) => FPL_CHIP_NAME_MAP[c.name])
    .filter((c): c is ChipName => c !== undefined);

  const allTeamIds = bootstrap.teams.map((t) => t.id);
  const leagueStandings = buildLeagueStandings(entry);
  const transfers = analyzeTransfers(squad, playerPool, {
    isLeadingALeague: leagueStandings.some((l) => l.rank === 1),
  });
  const postTransferSquad = applyRecommendedTransfers(squad.squad, transfers);
  const lineup = analyzeLineup(postTransferSquad, planningEvent);
  // Captaincy is chosen from the recommended lineup, not squad.picks'
  // historical starting XI (which may be a stale, already-played
  // gameweek's lineup once picksEvent's deadline has passed).
  const captaincy = analyzeCaptaincy(
    lineup.startingXI.map((p) => p.player),
    planningEvent,
  );

  return {
    managerName: `${entry.player_first_name} ${entry.player_last_name}`,
    teamName: entry.name,
    currentEvent: planningEvent,
    currentEventDeadline: planningEventInfo?.deadline_time ?? '',
    nextEvent: followingEventInfo
      ? { id: followingEventInfo.id, deadline: followingEventInfo.deadline_time }
      : null,
    generatedAt: new Date().toISOString(),
    squad,
    leagueStandings,
    chipsUsed,
    transfers,
    captaincy,
    chips: analyzeChips(fixtures, allTeamIds, squad, chipsUsed),
    priceAlerts: analyzePriceAlerts(squad.squad),
    lineup,
  };
}
