import type { AnalysisPlayer } from './types.js';
import { scoreForEvent } from './scoring.js';

export interface CaptaincyCandidate {
  player: AnalysisPlayer;
  score: number;
}

export interface CaptaincyAnalysis {
  captain: CaptaincyCandidate | null;
  viceCaptain: CaptaincyCandidate | null;
  /** Ranked best-first. */
  candidates: CaptaincyCandidate[];
}

/**
 * Ranks captaincy candidates for one event. Takes the eligible player
 * list directly (the caller passes the recommended starting XI, from
 * lib/analysis/lineup.ts) rather than reading "currently starting" off
 * historical FPL picks — those reflect whichever gameweek's deadline
 * last passed, which isn't necessarily the one being planned for.
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
