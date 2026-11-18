import type { AnalysisPlayer } from './types.js';

const EP_NEXT_WEIGHT = 1;
const FIXTURE_DIFFICULTY_WEIGHT = 1;
// a double gameweek counts both fixtures instead of averaging them
const DOUBLE_GAMEWEEK_BONUS = 2;

/**
 * shared by captaincy and lineup since both ask who scores most this week.
 * 0 when the player blanks.
 */
export function scoreForEvent(player: AnalysisPlayer, event: number): number {
  const upcoming = player.nextFixtures.filter((f) => f.event === event);
  if (upcoming.length === 0) return 0;

  const fixtureScore = upcoming.reduce(
    (acc, f) => acc + (6 - f.difficulty) * FIXTURE_DIFFICULTY_WEIGHT,
    0,
  );
  const doubleBonus =
    upcoming.length > 1 ? (upcoming.length - 1) * DOUBLE_GAMEWEEK_BONUS : 0;

  return player.epNext * EP_NEXT_WEIGHT + fixtureScore + doubleBonus;
}
