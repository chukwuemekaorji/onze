import type { AnalysisPlayer, SquadContext } from './types.js';

export type TransferReasonCode =
  | 'poor_form'
  | 'difficult_fixtures'
  | 'rotation_risk'
  | 'injury_doubt';

export interface TransferSuggestion {
  outPlayer: AnalysisPlayer;
  reasonCodes: TransferReasonCode[];
  /** Ranked best-first, capped to a handful. */
  inCandidates: AnalysisPlayer[];
}

export interface TransfersAnalysis {
  suggestions: TransferSuggestion[];
}

const FORM_WEIGHT = 2;
const FIXTURE_DIFFICULTY_WEIGHT = 1.5;
const EP_NEXT_WEIGHT = 1;

// FPL reports chance_of_playing as a 0-100 percent, or null when there's
// no fitness doubt at all (treated as 100 here).
function rotationRiskPenalty(player: AnalysisPlayer): number {
  if (player.chanceOfPlayingNextRound === null) return 0;
  return (100 - player.chanceOfPlayingNextRound) / 10;
}

function avgFixtureDifficulty(player: AnalysisPlayer): number {
  if (player.nextFixtures.length === 0) return 3; // neutral when unknown
  const sum = player.nextFixtures.reduce((acc, f) => acc + f.difficulty, 0);
  return sum / player.nextFixtures.length;
}

/** Higher score = stronger keep candidate; lower = better transfer-out candidate. */
export function scorePlayer(player: AnalysisPlayer): number {
  return (
    player.form * FORM_WEIGHT -
    avgFixtureDifficulty(player) * FIXTURE_DIFFICULTY_WEIGHT +
    player.epNext * EP_NEXT_WEIGHT -
    rotationRiskPenalty(player)
  );
}

function reasonCodesFor(player: AnalysisPlayer): TransferReasonCode[] {
  const codes: TransferReasonCode[] = [];
  if (player.form < 3) codes.push('poor_form');
  if (avgFixtureDifficulty(player) >= 4) codes.push('difficult_fixtures');
  if (
    player.chanceOfPlayingNextRound !== null &&
    player.chanceOfPlayingNextRound < 75
  ) {
    codes.push(
      player.chanceOfPlayingNextRound <= 25 ? 'injury_doubt' : 'rotation_risk',
    );
  }
  return codes;
}

export interface AnalyzeTransfersOptions {
  /** How many transfer-out suggestions to surface. Default 3. */
  maxSuggestions?: number;
  /** How many replacement candidates per suggestion. Default 3. */
  maxCandidatesPerSuggestion?: number;
}

export function analyzeTransfers(
  squad: SquadContext,
  fullPlayerPool: AnalysisPlayer[],
  options: AnalyzeTransfersOptions = {},
): TransfersAnalysis {
  const maxSuggestions = options.maxSuggestions ?? 3;
  const maxCandidatesPerSuggestion = options.maxCandidatesPerSuggestion ?? 3;
  const squadIds = new Set(squad.squad.map((p) => p.id));

  const weakestFirst = [...squad.squad].sort(
    (a, b) => scorePlayer(a) - scorePlayer(b),
  );

  const suggestions: TransferSuggestion[] = [];

  for (const outPlayer of weakestFirst.slice(0, maxSuggestions)) {
    const reasonCodes = reasonCodesFor(outPlayer);
    if (reasonCodes.length === 0) continue; // not actually a weak link

    const budget = outPlayer.nowCost + squad.bank;
    const inCandidates = fullPlayerPool
      .filter(
        (candidate) =>
          candidate.position === outPlayer.position &&
          !squadIds.has(candidate.id) &&
          candidate.nowCost <= budget,
      )
      .sort((a, b) => scorePlayer(b) - scorePlayer(a))
      .slice(0, maxCandidatesPerSuggestion);

    suggestions.push({ outPlayer, reasonCodes, inCandidates });
  }

  return { suggestions };
}
