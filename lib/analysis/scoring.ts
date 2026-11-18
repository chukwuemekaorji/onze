import type { AnalysisPlayer } from './types.js';

const EP_NEXT_WEIGHT = 1;
const FIXTURE_DIFFICULTY_WEIGHT = 1;
// A player with two fixtures in the target event (double gameweek) gets
// credit for both, so this isn't purely averaged across fixtures.
const DOUBLE_GAMEWEEK_BONUS = 2;

/**
 * Expected-points-flavored score for a player in one specific gameweek.
 * Shared by captaincy (who to armband) and lineup (who to start) since
 * both are really the same question: who scores most this gameweek.
 * Returns 0 for a player who blanks that event.
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
