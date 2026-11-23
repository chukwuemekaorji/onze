/**
 * fpl's rules for a manager's squad, as the decision backtest plays them:
 * selling prices, a week's transfers, and a gameweek's score with auto-subs
 * and the vice-captain. pure: state in, state out
 */

import {
  MAX_PLAYERS_PER_CLUB,
  POINTS_PER_HIT,
  nextFreeTransfers,
} from '../analysis/transfers.js';
import type { Position } from '../analysis/types.js';

/** fpl cost units: 1000 is £100.0m */
export const STARTING_BUDGET = 1000;
export const SQUAD_SHAPE: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
export const SQUAD_SIZE = 15;

/**
 * fpl pays back the purchase price plus half of any rise since, rounded down
 * to the nearest 0.1m; a fall is passed on in full
 */
export function sellingPrice(purchasePrice: number, currentPrice: number): number {
  for (const value of [purchasePrice, currentPrice]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`prices are whole fpl cost units above 0, got ${value}`);
    }
  }
  if (currentPrice <= purchasePrice) return currentPrice;
  return purchasePrice + Math.floor((currentPrice - purchasePrice) / 2);
}

export interface OwnedPlayer {
  id: number;
  position: Position;
  teamId: number;
  purchasePrice: number;
}

export interface SquadState {
  players: OwnedPlayer[];
  bank: number;
  /** free transfers going into the next deadline */
  freeTransfers: number;
}

/** what a player costs to buy this week, and the club he plays for */
export interface Market {
  price(playerId: number): number;
  teamId(playerId: number): number;
  position(playerId: number): Position;
}

export interface Swap {
  outId: number;
  inId: number;
}

export interface WeekTransfers {
  state: SquadState;
  hits: number;
  hitCost: number;
}

/**
 * one deadline's transfers. throws on anything fpl would refuse, so a policy
 * that breaks a rule fails loudly instead of quietly scoring an illegal squad
 */
export function makeTransfers(
  state: SquadState,
  swaps: readonly Swap[],
  market: Market,
): WeekTransfers {
  const outs = new Set(swaps.map((swap) => swap.outId));
  const ins = new Set(swaps.map((swap) => swap.inId));
  if (outs.size !== swaps.length || ins.size !== swaps.length) {
    throw new Error('a player can only be sold or bought once a week');
  }
  const owned = new Map(state.players.map((player) => [player.id, player]));
  let bank = state.bank;
  for (const swap of swaps) {
    const out = owned.get(swap.outId);
    if (out === undefined) throw new Error(`player ${swap.outId} isn't in the squad`);
    if (owned.has(swap.inId)) throw new Error(`player ${swap.inId} is already owned`);
    if (market.position(swap.inId) !== out.position) {
      throw new Error(`player ${swap.inId} doesn't play ${out.position}`);
    }
    bank +=
      sellingPrice(out.purchasePrice, market.price(out.id)) - market.price(swap.inId);
  }
  // fpl checks the money once, after all of a week's transfers
  if (bank < 0) throw new Error(`the week's transfers overspend by ${-bank}`);
  // clubs as they are now: a player who moved club mid-season counts at his
  // new one, as the app's transfer logic sees him
  const players = state.players.map((player) => {
    const swap = swaps.find((entry) => entry.outId === player.id);
    if (swap === undefined) return { ...player, teamId: market.teamId(player.id) };
    return {
      id: swap.inId,
      position: player.position,
      teamId: market.teamId(swap.inId),
      purchasePrice: market.price(swap.inId),
    };
  });
  // a move between clubs can leave four at one club; that's allowed to stand,
  // so only the clubs this week's buys join are held to three
  assertLegalSquad(
    players,
    bank,
    new Set(swaps.map((swap) => market.teamId(swap.inId))),
  );
  const hits = Math.max(0, swaps.length - state.freeTransfers);
  return {
    state: {
      players,
      bank,
      freeTransfers: nextFreeTransfers(state.freeTransfers, swaps.length),
    },
    hits,
    hitCost: hits * POINTS_PER_HIT,
  };
}

/**
 * fifteen players in fpl's shape, no more than three a club, money not
 * overspent. `clubsChecked` limits the club rule to those clubs; all by default
 */
export function assertLegalSquad(
  players: readonly OwnedPlayer[],
  bank: number,
  clubsChecked: ReadonlySet<number> | null = null,
): void {
  if (players.length !== SQUAD_SIZE) {
    throw new Error(`a squad has ${SQUAD_SIZE} players, this one ${players.length}`);
  }
  for (const position of Object.keys(SQUAD_SHAPE) as Position[]) {
    const count = players.filter((player) => player.position === position).length;
    if (count !== SQUAD_SHAPE[position]) {
      throw new Error(
        `a squad has ${SQUAD_SHAPE[position]} ${position}, this one ${count}`,
      );
    }
  }
  const clubs = new Map<number, number>();
  for (const player of players)
    clubs.set(player.teamId, (clubs.get(player.teamId) ?? 0) + 1);
  for (const [club, count] of clubs) {
    if (clubsChecked !== null && !clubsChecked.has(club)) continue;
    if (count > MAX_PLAYERS_PER_CLUB)
      throw new Error(`club ${club} has ${count} players`);
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error('a squad lists the same player twice');
  }
  if (bank < 0) throw new Error(`a squad can't be over budget, bank ${bank}`);
}

/** who starts, the bench in fpl's order, and the armbands */
export interface Selection {
  /** eleven ids */
  startingXI: number[];
  /** four ids: the backup keeper and the outfield subs, first sub first */
  bench: number[];
  captainId: number;
  viceCaptainId: number;
}

export interface Outcome {
  points: number;
  minutes: number;
}

export interface GameweekScore {
  points: number;
  /** ids that came off the bench */
  subbedOn: number[];
  /** who got the double points, or null when neither armband played */
  doubledId: number | null;
}

// fpl's least a formation may field after subs
const MINIMUM_ON_PITCH: Record<Position, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };

/**
 * fpl's auto-subs: a starter with no minutes is replaced by the first bench
 * player who played and keeps the formation legal; a keeper only by the
 * backup keeper. the captain's points double; if he didn't play, the vice's do
 */
export function scoreGameweek(
  selection: Selection,
  positionOf: (playerId: number) => Position,
  outcome: (playerId: number) => Outcome,
): GameweekScore {
  if (selection.startingXI.length !== 11 || selection.bench.length !== 4) {
    throw new Error('a selection is eleven starters and four on the bench');
  }
  const played = (id: number) => outcome(id).minutes > 0;
  const onPitch = [...selection.startingXI];
  const benchLeft = [...selection.bench];
  const subbedOn: number[] = [];
  for (let index = 0; index < onPitch.length; index += 1) {
    const starter = onPitch[index];
    if (starter === undefined || played(starter)) continue;
    const keeper = positionOf(starter) === 'GK';
    const replacement = benchLeft.find((candidate) => {
      if (!played(candidate)) return false;
      if ((positionOf(candidate) === 'GK') !== keeper) return false;
      const after = onPitch.map((id) => (id === starter ? candidate : id));
      return (Object.keys(MINIMUM_ON_PITCH) as Position[]).every(
        (position) =>
          after.filter((id) => positionOf(id) === position).length >=
          MINIMUM_ON_PITCH[position],
      );
    });
    if (replacement === undefined) continue;
    onPitch[index] = replacement;
    benchLeft.splice(benchLeft.indexOf(replacement), 1);
    subbedOn.push(replacement);
  }
  const doubledId = played(selection.captainId)
    ? selection.captainId
    : played(selection.viceCaptainId)
      ? selection.viceCaptainId
      : null;
  const base = onPitch.reduce((sum, id) => sum + outcome(id).points, 0);
  // the armband only doubles a player who is on the pitch, as fpl does
  const bonus =
    doubledId !== null && onPitch.includes(doubledId) ? outcome(doubledId).points : 0;
  return { points: base + bonus, subbedOn, doubledId };
}
