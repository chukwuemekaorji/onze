/**
 * pure mapping from raw fpl responses to analysis shapes. difficulty comes from
 * the fixtures list, not element-summary, to avoid 600+ per-player calls.
 */

import type {
  FplBootstrapStatic,
  FplElement,
  FplEntry,
  FplFixture,
  FplEntryPicksResponse,
  FplEntryHistoryResponse,
} from './fpl-types.js';
import type {
  AnalysisPlayer,
  FixtureDifficulty,
  LeagueStanding,
  Position,
  SquadContext,
  SquadPick,
} from './analysis/types.js';
import type { TransfersAnalysis } from './analysis/transfers.js';

const POSITION_BY_ELEMENT_TYPE: Record<number, Position> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

function toPosition(elementTypeId: number): Position {
  const position = POSITION_BY_ELEMENT_TYPE[elementTypeId];
  if (!position) {
    throw new Error(`Unknown FPL element_type id: ${elementTypeId}`);
  }
  return position;
}

// fpl sends form, ep_next etc. as strings; junk becomes 0 rather than
// failing the whole report
function parseFplFloat(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildFixtureDifficulty(
  fixtures: FplFixture[],
  teamId: number,
  fromEvent: number,
  lookaheadEvents: number,
  teamShortNameById: Map<number, string>,
): FixtureDifficulty[] {
  const toEvent = fromEvent + lookaheadEvents - 1;
  return fixtures
    .filter(
      (f) =>
        f.event !== null &&
        f.event >= fromEvent &&
        f.event <= toEvent &&
        (f.team_h === teamId || f.team_a === teamId),
    )
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))
    .map((f) => {
      const isHome = f.team_h === teamId;
      const opponentId = isHome ? f.team_a : f.team_h;
      return {
        event: f.event as number,
        isHome,
        difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
        opponentShortName: teamShortNameById.get(opponentId) ?? '???',
      };
    });
}

export interface BuildAnalysisPlayerOptions {
  /** first gameweek of the fixture lookahead */
  fromEvent: number;
  /** default 5 */
  lookaheadEvents?: number;
}

export function buildAnalysisPlayer(
  element: FplElement,
  bootstrap: FplBootstrapStatic,
  fixtures: FplFixture[],
  options: BuildAnalysisPlayerOptions,
): AnalysisPlayer {
  const teamShortNameById = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const team = bootstrap.teams.find((t) => t.id === element.team);
  const lookaheadEvents = options.lookaheadEvents ?? 5;

  return {
    id: element.id,
    webName: element.web_name,
    teamId: element.team,
    teamShortName: team?.short_name ?? '???',
    position: toPosition(element.element_type),
    nowCost: element.now_cost,
    form: parseFplFloat(element.form),
    epNext: parseFplFloat(element.ep_next),
    totalPoints: element.total_points,
    selectedByPercent: parseFplFloat(element.selected_by_percent),
    chanceOfPlayingNextRound: element.chance_of_playing_next_round,
    costChangeEvent: element.cost_change_event,
    transfersInEvent: element.transfers_in_event,
    transfersOutEvent: element.transfers_out_event,
    nextFixtures: buildFixtureDifficulty(
      fixtures,
      element.team,
      options.fromEvent,
      lookaheadEvents,
      teamShortNameById,
    ),
  };
}

export function buildPlayerPool(
  bootstrap: FplBootstrapStatic,
  fixtures: FplFixture[],
  options: BuildAnalysisPlayerOptions,
): AnalysisPlayer[] {
  return bootstrap.elements.map((element) =>
    buildAnalysisPlayer(element, bootstrap, fixtures, options),
  );
}

export function buildSquadContext(
  picks: FplEntryPicksResponse,
  playerPool: AnalysisPlayer[],
  currentEvent: number,
  bank: number,
  freeTransfers: number,
): SquadContext {
  const poolById = new Map(playerPool.map((p) => [p.id, p]));
  const squad: AnalysisPlayer[] = [];
  const squadPicks: SquadPick[] = [];

  for (const pick of picks.picks) {
    const player = poolById.get(pick.element);
    if (!player) continue; // defensive: pool and picks should always agree
    squad.push(player);
    squadPicks.push({
      elementId: pick.element,
      isCaptain: pick.is_captain,
      isViceCaptain: pick.is_vice_captain,
      multiplier: pick.multiplier,
    });
  }

  return { currentEvent, bank, freeTransfers, squad, picks: squadPicks };
}

// "s" is an fpl system league (overall, country) that nobody really wins;
// "x" is one the manager created or joined
const USER_JOINED_LEAGUE_TYPE = 'x';

export function buildLeagueStandings(entry: FplEntry): LeagueStanding[] {
  return entry.leagues.classic
    .filter((league) => league.league_type === USER_JOINED_LEAGUE_TYPE)
    .map((league) => ({
      id: league.id,
      name: league.name,
      rank: league.entry_rank,
      previousRank: league.entry_last_rank,
      totalEntries: league.rank_count,
    }));
}

// fpl rule since 2024/25: 1 free transfer for gw2, +1 per week not fully used,
// capped at 5, back to 1 after a hit. wildcard and free hit weeks don't count.
const FREE_TRANSFER_CAP = 5;
const CHIPS_EXEMPT_FROM_TRANSFER_COUNT = new Set(['wildcard', 'freehit']);

/** the public api never exposes free transfers, so replay them from history */
export function computeFreeTransfers(
  history: FplEntryHistoryResponse,
  planningEvent: number,
): number {
  if (planningEvent <= 1) return 1;

  const chipExemptEvents = new Set(
    history.chips
      .filter((c) => CHIPS_EXEMPT_FROM_TRANSFER_COUNT.has(c.name))
      .map((c) => c.event),
  );

  let freeTransfers = 1; // every manager has 1 entering gw2
  for (const gw of history.current) {
    if (gw.event < 2 || gw.event >= planningEvent) continue;
    const transfersMade = chipExemptEvents.has(gw.event) ? 0 : gw.event_transfers;
    freeTransfers = Math.min(
      FREE_TRANSFER_CAP,
      Math.max(0, freeTransfers - transfersMade) + 1,
    );
  }

  return freeTransfers;
}

/** so lineup and captaincy see the squad after the recommended swaps */
export function applyRecommendedTransfers(
  squad: AnalysisPlayer[],
  transfers: TransfersAnalysis,
): AnalysisPlayer[] {
  const replacementByOutId = new Map(
    transfers.suggestions
      .slice(0, transfers.recommendedCount)
      .map((s) => [s.outPlayer.id, s.inCandidates[0]] as const)
      .filter((entry): entry is [number, AnalysisPlayer] => entry[1] !== undefined),
  );

  return squad.map((player) => replacementByOutId.get(player.id) ?? player);
}
