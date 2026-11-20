import type { AnalysisPlayer } from './types.js';

/**
 * shared by captaincy and lineup since both ask who scores most this week:
 * onze's projection, which already counts fixtures, doubles (both fixtures)
 * and blanks (0) and has fpl's team news applied
 */
export function scoreForEvent(player: AnalysisPlayer, event: number): number {
  // the projection is for one gameweek; asking about another is a wiring bug
  if (player.projection.event !== event) {
    throw new Error(
      `${player.webName}'s projection is for gameweek ${player.projection.event}, not ${event}`,
    );
  }
  return player.projection.points;
}
