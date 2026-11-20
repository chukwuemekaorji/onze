import type { PlayerStatus } from './types.js';

/**
 * fpl's team news as a multiplier on the model's chance of playing. the model
 * only knows past minutes; this is the one thing it can't learn from them.
 * fpl's percentage wins when given. without one, a fit player is 1 and an
 * injured, suspended, departed or ineligible one is 0
 */
export function availabilityFactor(
  status: PlayerStatus,
  chanceOfPlayingNextRound: number | null,
): number {
  if (chanceOfPlayingNextRound !== null) {
    if (!Number.isFinite(chanceOfPlayingNextRound)) {
      throw new Error(
        `chance of playing must be a number, got ${chanceOfPlayingNextRound}`,
      );
    }
    return Math.min(100, Math.max(0, chanceOfPlayingNextRound)) / 100;
  }
  return STATUS_FACTOR[status];
}

// fpl nearly always sends a percentage with "d"; half is the honest default if not
const DOUBTFUL_WITHOUT_A_FIGURE = 0.5;

const STATUS_FACTOR: Record<PlayerStatus, number> = {
  a: 1,
  d: DOUBTFUL_WITHOUT_A_FIGURE,
  i: 0,
  s: 0,
  u: 0,
  n: 0,
};
