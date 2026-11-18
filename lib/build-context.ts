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
  FplFixture,
  FplEntryPicksResponse,
} from './fpl-types.js';
import type {
  AnalysisPlayer,
  FixtureDifficulty,
  Position,
  SquadContext,
  SquadPick,
} from './analysis/types.js';

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

  return { currentEvent, bank, squad, picks: squadPicks };
}
