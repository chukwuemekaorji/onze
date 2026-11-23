/**
 * the squads every policy starts the season from, built at gameweek 1 from
 * last season's data only. squad 1 is the best guess: the most points last
 * season that fits the rules. the rest jitter last season's points with
 * seeded noise, so the backtest isn't judged from one lucky or unlucky start
 */

import { seededRandom } from '../eval/bootstrap.js';
import { MAX_PLAYERS_PER_CLUB } from '../analysis/transfers.js';
import type { Position } from '../analysis/types.js';
import { SQUAD_SHAPE, STARTING_BUDGET, assertLegalSquad } from './fpl-rules.js';
import type { OwnedPlayer } from './fpl-rules.js';

export interface SquadCandidate {
  id: number;
  position: Position;
  teamId: number;
  /** price at gameweek 1 */
  price: number;
  /** total fpl points last season, 0 for anyone new to the league */
  lastSeasonPoints: number;
}

export interface StartSquad {
  players: OwnedPlayer[];
  bank: number;
}

// how much each variant shakes last season's points: a factor of e^(0.4 z),
// so most players move by under half, enough to change the squad
export const START_SQUAD_NOISE = 0.4;

export function buildStartSquads(
  candidates: readonly SquadCandidate[],
  count: number,
  seed: number,
): StartSquad[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`need at least one start squad, got ${count}`);
  }
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, variant) => {
    const scores = new Map(
      candidates.map((candidate) => [
        candidate.id,
        variant === 0
          ? candidate.lastSeasonPoints
          : candidate.lastSeasonPoints * Math.exp(START_SQUAD_NOISE * normal(random)),
      ]),
    );
    return greedySquad(candidates, (candidate) => scores.get(candidate.id) ?? 0);
  });
}

/**
 * best score first, taking a player only while the rest of the squad can
 * still be bought with the cheapest players left in each position
 */
export function greedySquad(
  candidates: readonly SquadCandidate[],
  score: (candidate: SquadCandidate) => number,
): StartSquad {
  const ordered = [...candidates].sort(
    (a, b) => score(b) - score(a) || a.price - b.price || a.id - b.id,
  );
  const needs: Record<Position, number> = { ...SQUAD_SHAPE };
  const clubs = new Map<number, number>();
  const picked: SquadCandidate[] = [];
  let budget = STARTING_BUDGET;
  const cheapestToFill = (excluded: ReadonlySet<number>): number => {
    let total = 0;
    for (const position of Object.keys(needs) as Position[]) {
      const prices = candidates
        .filter(
          (candidate) => candidate.position === position && !excluded.has(candidate.id),
        )
        .map((candidate) => candidate.price)
        .sort((a, b) => a - b)
        .slice(0, needs[position]);
      if (prices.length < needs[position]) return Number.POSITIVE_INFINITY;
      total += prices.reduce((sum, price) => sum + price, 0);
    }
    return total;
  };
  for (const candidate of ordered) {
    if (needs[candidate.position] === 0) continue;
    if ((clubs.get(candidate.teamId) ?? 0) >= MAX_PLAYERS_PER_CLUB) continue;
    needs[candidate.position] -= 1;
    const excluded = new Set([...picked.map((player) => player.id), candidate.id]);
    if (candidate.price + cheapestToFill(excluded) > budget) {
      needs[candidate.position] += 1;
      continue;
    }
    picked.push(candidate);
    budget -= candidate.price;
    clubs.set(candidate.teamId, (clubs.get(candidate.teamId) ?? 0) + 1);
    if (picked.length === 15) break;
  }
  const players = picked.map((candidate) => ({
    id: candidate.id,
    position: candidate.position,
    teamId: candidate.teamId,
    purchasePrice: candidate.price,
  }));
  // the cheapest-fill check ignores the club limit, so a squad could in theory
  // come up short; the rules check says so rather than starting a broken squad
  assertLegalSquad(players, budget);
  return { players, bank: budget };
}

/** a standard normal draw, box-muller from two uniforms */
function normal(random: () => number): number {
  const u = Math.max(random(), Number.MIN_VALUE);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}
