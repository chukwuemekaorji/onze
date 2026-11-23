/**
 * one policy, one start squad, one season, played forward deadline by
 * deadline: decide on what the policy may know, then score what really
 * happened. no chips. pure: the views are worked out beforehand
 */

import type { AnalysisPlayer, SquadContext } from '../analysis/types.js';
import { makeTransfers, scoreGameweek, sellingPrice } from './fpl-rules.js';
import type { Market, SquadState } from './fpl-rules.js';
import type { Policy } from './policies.js';
import { selectTeam } from './policies.js';
import { clubAt, isInGame, outcomeOf, priceAt } from './season-data.js';
import type { SeasonData } from './season-data.js';
import type { StartSquad } from './start-squads.js';
import type { ViewKind } from './views.js';

export interface WeekResult {
  gameweek: number;
  /** the eleven's points after auto-subs, captain doubled */
  points: number;
  hitCost: number;
  hits: number;
  transfers: number;
}

export interface SeasonRun {
  season: string;
  /** 1 is the best-guess start squad */
  squadNumber: number;
  policyId: Policy['id'];
  weeks: WeekResult[];
  /** points minus hits over the season */
  total: number;
  transfers: number;
  hits: number;
}

/** every player at a deadline as one view sees him, by id */
export type ViewAt = (
  gameweek: number,
  kind: ViewKind,
) => ReadonlyMap<number, AnalysisPlayer>;

// fpl's rule: one free transfer going into gameweek 2, none before it
const FREE_TRANSFERS_FOR_GAMEWEEK_TWO = 1;

export function simulateSeason(
  data: SeasonData,
  start: StartSquad,
  squadNumber: number,
  policy: Policy,
  viewAt: ViewAt,
): SeasonRun {
  const player = (id: number) => {
    const found = data.players.get(id);
    if (found === undefined) throw new Error(`no player ${id} in ${data.season}`);
    return found;
  };
  let state: SquadState = {
    players: start.players,
    bank: start.bank,
    freeTransfers: FREE_TRANSFERS_FOR_GAMEWEEK_TWO,
  };
  const weeks: WeekResult[] = [];
  const [firstGameweek] = data.gameweeks;
  for (const gameweek of data.gameweeks) {
    const view = viewAt(gameweek, policy.view);
    const seen = (id: number) => {
      const found = view.get(id);
      if (found === undefined)
        throw new Error(`no view of player ${id} in gameweek ${gameweek}`);
      return found;
    };
    let hitCost = 0;
    let hits = 0;
    let transfers = 0;
    // the squad is picked at gameweek 1, so the first transfers come at gameweek 2
    if (gameweek !== firstGameweek) {
      const market: Market = {
        price: (id) => priceAt(player(id), gameweek),
        teamId: (id) => clubAt(player(id), gameweek).teamId,
        position: (id) => player(id).position,
      };
      const squad: SquadContext = {
        currentEvent: gameweek,
        bank: state.bank,
        freeTransfers: state.freeTransfers,
        // a squad player is worth his selling price, so the app's budget sums
        // follow fpl's half-of-any-rise rule without knowing about it
        squad: state.players.map((owned) => ({
          ...seen(owned.id),
          nowCost: sellingPrice(owned.purchasePrice, market.price(owned.id)),
        })),
        picks: [],
      };
      const pool = [...view.values()].filter((entry) =>
        isInGame(player(entry.id), gameweek),
      );
      const swaps = policy.chooseSwaps(squad, pool);
      const made = makeTransfers(state, swaps, market);
      state = made.state;
      hitCost = made.hitCost;
      hits = made.hits;
      transfers = swaps.length;
    }
    const selection = selectTeam(
      state.players.map((owned) => seen(owned.id)),
      gameweek,
    );
    const score = scoreGameweek(
      selection,
      (id) => player(id).position,
      (id) => outcomeOf(data, gameweek, id),
    );
    weeks.push({ gameweek, points: score.points, hitCost, hits, transfers });
  }
  return {
    season: data.season,
    squadNumber,
    policyId: policy.id,
    weeks,
    total: weeks.reduce((sum, week) => sum + week.points - week.hitCost, 0),
    transfers: weeks.reduce((sum, week) => sum + week.transfers, 0),
    hits: weeks.reduce((sum, week) => sum + week.hits, 0),
  };
}
