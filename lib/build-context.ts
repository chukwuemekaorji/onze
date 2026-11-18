/**
 * Maps raw FPL API responses into the plain data shapes lib/analysis/*
 * consumes. Pure transform, no fetch calls — those live in fpl-client.ts.
 *
 * Fixture difficulty for every player (squad or full pool) is derived
 * from the general fixtures list + team id, not from element-summary:
 * FPL's fixture-level team_h_difficulty/team_a_difficulty already carries
 * the same rating element-summary would return per player, so deriving it
 * this way avoids one API call per player (600+) for the full pool.
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

// FPL returns several numeric fields (form, ep_next, selected_by_percent)
// as strings; this repo treats "unparseable" as 0 rather than throwing,
// since these are display stats, not values analysis correctness depends on.
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
  /** Gameweek to start the fixture lookahead from — normally the current/next event. */
  fromEvent: number;
  /** How many gameweeks of fixtures to attach. Default 5. */
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

// league_type "s" marks FPL's own system leagues (Overall, country,
// gameweek, "second chance") — every manager is auto-entered in these and
// nobody meaningfully "wins" one. "x" is a league a manager actually
// created or joined, which is what "the leagues I'm in" means in practice.
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

// FPL's free-transfer roll-over rule (2024/25 ruleset onward): every
// manager starts with 1 free transfer for gameweek 2, gains +1 for each
// gameweek where it isn't fully used (capped at 5), and drops back to 1
// the gameweek after any that overspends it. Transfers made while
// Wildcard or Free Hit is active don't count against this — FPL excludes
// them from the following gameweek's free-transfer calculation entirely.
const FREE_TRANSFER_CAP = 5;
const CHIPS_EXEMPT_FROM_TRANSFER_COUNT = new Set(['wildcard', 'freehit']);

/**
 * Simulates the free-transfer count a manager has going into
 * `planningEvent`, from their full gameweek-by-gameweek history. FPL's
 * public API never exposes this directly (the real-time count only
 * appears on the authenticated "my-team" endpoint), so it has to be
 * derived from event_transfers on every prior finished gameweek.
 */
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

  let freeTransfers = 1; // what every manager has entering gameweek 2
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

/**
 * Swaps in the recommended transfers (if any) so downstream lineup/
 * formation analysis reflects the squad after the suggested changes, not
 * the one currently owned.
 */
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
