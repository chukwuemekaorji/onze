import type { AnalysisPlayer, SquadContext } from './types.js';

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

const EP_NEXT_WEIGHT = 1;
const FIXTURE_DIFFICULTY_WEIGHT = 1;
// A player with two fixtures in the upcoming event (double gameweek)
// gets credit for both, so this isn't purely averaged — see scoreCandidate.
const DOUBLE_GAMEWEEK_BONUS = 2;

function scoreCandidate(player: AnalysisPlayer, nextEvent: number): number {
  const upcoming = player.nextFixtures.filter((f) => f.event === nextEvent);
  if (upcoming.length === 0) return 0; // blank gameweek for this player

  const fixtureScore = upcoming.reduce(
    (acc, f) => acc + (6 - f.difficulty) * FIXTURE_DIFFICULTY_WEIGHT,
    0,
  );
  const doubleBonus =
    upcoming.length > 1 ? (upcoming.length - 1) * DOUBLE_GAMEWEEK_BONUS : 0;

  return player.epNext * EP_NEXT_WEIGHT + fixtureScore + doubleBonus;
}

/** Only players actually in the starting XI (multiplier > 0) can be captained. */
export function analyzeCaptaincy(squad: SquadContext): CaptaincyAnalysis {
  const startingIds = new Set(
    squad.picks.filter((p) => p.multiplier > 0).map((p) => p.elementId),
  );
  const eligible = squad.squad.filter((p) => startingIds.has(p.id));

  const candidates: CaptaincyCandidate[] = eligible
    .map((player) => ({ player, score: scoreCandidate(player, squad.currentEvent) }))
    .sort((a, b) => b.score - a.score);

  return {
    captain: candidates[0] ?? null,
    viceCaptain: candidates[1] ?? null,
    candidates,
  };
}
