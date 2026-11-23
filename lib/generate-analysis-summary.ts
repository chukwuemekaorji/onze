/** fetch, build, analyze: everything /api/summary returns */

import {
  getBootstrapStatic,
  getFixtures,
  getEntry,
  getEntryPicks,
  getEntryHistory,
  getEventLive,
} from './fpl-client.js';
import {
  buildPlayerPool,
  buildSquadContext,
  buildLeagueStandings,
  applyRecommendedTransfers,
  computeFreeTransfers,
  toPlayerStatus,
} from './build-context.js';
import { buildMatchHistory } from './build-match-history.js';
import { buildPlayerProjections } from './build-projections.js';
import { PROJECTION_WEIGHTS } from './analysis/projection-weights.js';
import { EVENT_WEIGHTS } from './analysis/event-weights.js';
import { TWO_PART_SHARE } from './analysis/blend-weight.js';
import { LAST_SEASON_PRIOR } from './projection-prior.js';
import { analyzeTransfers } from './analysis/transfers.js';
import { analyzeCaptaincy } from './analysis/captaincy.js';
import { analyzeChips } from './analysis/chips.js';
import type { ChipName } from './analysis/chips.js';
import { analyzePriceAlerts } from './analysis/price-alerts.js';
import { analyzeLineup } from './analysis/lineup.js';
import { planTransfers } from './analysis/planner.js';
import type { AnalysisSummary } from './analysis-summary.js';

const LOOKAHEAD_EVENTS = 5;
// transfers are weighed over this many gameweeks, the planned one first
const PROJECTION_HORIZON_EVENTS = 3;
// the transfer planner looks this many gameweeks ahead, the planned one first
const PLAN_GAMEWEEKS = 5;
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

  // every gameweek before the planned one has passed its deadline; its live
  // stats are the season so far, one call each
  const pastEvents = bootstrap.events
    .filter((e) => e.id < planningEvent)
    .map((e) => e.id);
  const [entry, picks, history, pastLive] = await Promise.all([
    getEntry(managerId),
    getEntryPicks(managerId, picksEvent),
    getEntryHistory(managerId),
    Promise.all(
      pastEvents.map(async (event) => ({ event, live: await getEventLive(event) })),
    ),
  ]);

  const projections = buildPlayerProjections(
    bootstrap,
    fixtures,
    (element) => toPlayerStatus(element.status),
    {
      event: planningEvent,
      deadline: planningEventInfo?.deadline_time ?? new Date(now).toISOString(),
      horizonEvents: PROJECTION_HORIZON_EVENTS,
      planEvents: PLAN_GAMEWEEKS,
      history: buildMatchHistory(pastLive, fixtures, bootstrap),
      prior: LAST_SEASON_PRIOR,
      weights: {
        twoPart: PROJECTION_WEIGHTS,
        event: EVENT_WEIGHTS,
        twoPartShare: TWO_PART_SHARE,
      },
    },
  );
  const playerPool = buildPlayerPool(bootstrap, fixtures, {
    fromEvent: planningEvent,
    lookaheadEvents: LOOKAHEAD_EVENTS,
    projections,
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
  // the one-week advice is this week's answer (results/decision-backtest.md);
  // the plan starts from it and only looks at the weeks after
  const plan = planTransfers(squad, playerPool, {
    weeks: PLAN_GAMEWEEKS,
    isLeadingALeague: leagueStandings.some((l) => l.rank === 1),
    firstWeek: transfers.suggestions
      .slice(0, transfers.recommendedCount)
      .flatMap((suggestion) => {
        const replacement = suggestion.inCandidates[0];
        return replacement === undefined
          ? []
          : [{ outId: suggestion.outPlayer.id, inId: replacement.id }];
      }),
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
    plan,
    captaincy,
    chips: analyzeChips(fixtures, allTeamIds, squad, chipsUsed),
    priceAlerts: analyzePriceAlerts(squad.squad, {
      daysSinceGameweekOpened: daysSince(picksEventInfo?.deadline_time, now),
    }),
    lineup,
  };
}
