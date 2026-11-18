import type { AnalysisPlayer } from './types.js';
import { scoreForEvent } from './scoring.js';

export interface CaptaincyCandidate {
  player: AnalysisPlayer;
  score: number;
}

export interface CaptaincyAnalysis {
  captain: CaptaincyCandidate | null;
  viceCaptain: CaptaincyCandidate | null;
  /** best first */
  candidates: CaptaincyCandidate[];
}

/**
 * takes the recommended xi, not fpl's picks, which reflect the last passed
 * deadline rather than the gameweek being planned
 */
export function analyzeCaptaincy(
  eligiblePlayers: AnalysisPlayer[],
  event: number,
): CaptaincyAnalysis {
  const candidates: CaptaincyCandidate[] = eligiblePlayers
    .map((player) => ({ player, score: scoreForEvent(player, event) }))
    .sort((a, b) => b.score - a.score);

  return {
    captain: candidates[0] ?? null,
    viceCaptain: candidates[1] ?? null,
    candidates,
  };
}
