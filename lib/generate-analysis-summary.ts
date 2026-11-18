/** fetch, build, analyze: everything /api/summary returns */

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
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// fpl's chip codes as they appear in /entry/{id}/history/
const FPL_CHIP_NAME_MAP: Record<string, ChipName> = {
  wildcard: 'wildcard',
  bboost: 'bench_boost',
  '3xc': 'triple_captain',
  freehit: 'free_hit',
};

export class NoCurrentGameweekError extends Error {}

function daysSince(iso: string | undefined, now: number): number | undefined {
  const time = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(time) ? (now - time) / MS_PER_DAY : undefined;
}

export async function generateAnalysisSummary(
  managerId: number,
): Promise<AnalysisSummary> {
  const [bootstrap, fixtures] = await Promise.all([
    getBootstrapStatic(),
    getFixtures(),
  ]);

  // fpl 404s on picks for a gameweek that hasn't started, so this is always
  // the live gameweek, never the one being planned
  const picksEvent =
    bootstrap.events.find((e) => e.is_current)?.id ??
    bootstrap.events.find((e) => e.is_next)?.id;

  if (!picksEvent) {
    throw new NoCurrentGameweekError(
      'Could not determine the current gameweek from FPL data.',
    );
  }

  // fpl keeps is_current set past the deadline, so default to the next open
  // deadline. the squad only changes by transfer, so picksEvent's still holds.
  const now = Date.now();
  const nextActionableEvent = bootstrap.events.find(
    (e) => new Date(e.deadline_time).getTime() > now,
  );
  const planningEvent = nextActionableEvent?.id ?? picksEvent;

  const planningEventInfo = bootstrap.events.find((e) => e.id === planningEvent);
  // the live gameweek opened at its deadline; its transfer totals run from there
  const picksEventInfo = bootstrap.events.find((e) => e.id === picksEvent);
  const followingEventInfo = bootstrap.events.find((e) => e.id === planningEvent + 1);

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
  // use the recommended xi; squad.picks may be an already-played gameweek's
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
    priceAlerts: analyzePriceAlerts(squad.squad, {
      daysSinceGameweekOpened: daysSince(picksEventInfo?.deadline_time, now),
    }),
    lineup,
  };
}
