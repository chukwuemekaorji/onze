import type { AnalysisPlayer, SquadContext } from './types.js';

export type TransferReasonCode =
  | 'poor_form'
  | 'difficult_fixtures'
  | 'rotation_risk'
  | 'injury_doubt';

export interface TransferSuggestion {
  outPlayer: AnalysisPlayer;
  reasonCodes: TransferReasonCode[];
  /** best first, capped to a handful */
  inCandidates: AnalysisPlayer[];
  /** ep_next gain before any hit; 0 when nothing affordable exists */
  expectedPointsGain: number;
}

export interface TransfersAnalysis {
  /** ranked by gain; recommendedCount says how many to actually make */
  suggestions: TransferSuggestion[];
  /** leading suggestions worth making after weighing hits; can be 0 */
  recommendedCount: number;
  /** free transfers going into this gameweek */
  freeTransfers: number;
  /** 4 points per transfer beyond the free ones */
  pointsHitCost: number;
  /** total gain minus pointsHitCost */
  projectedNetGain: number;
}

const FORM_WEIGHT = 2;
const FIXTURE_DIFFICULTY_WEIGHT = 1.5;
const EP_NEXT_WEIGHT = 1;

export const POINTS_PER_HIT = 4;

// ep_next is a one-week estimate, so stacking hits stacks risk. allow one hit
// at most, and only when the gain clears the cost by a margin.
const MAX_HITS_PER_WEEK = 1;
const HIT_SAFETY_MARGIN = 2;

// fpl gives 0-100, or null when there's no doubt (treated as 100)
function rotationRiskPenalty(player: AnalysisPlayer): number {
  if (player.chanceOfPlayingNextRound === null) return 0;
  return (100 - player.chanceOfPlayingNextRound) / 10;
}

function avgFixtureDifficulty(player: AnalysisPlayer): number {
  if (player.nextFixtures.length === 0) return 3; // neutral when unknown
  const sum = player.nextFixtures.reduce((acc, f) => acc + f.difficulty, 0);
  return sum / player.nextFixtures.length;
}

/** higher means keep, lower means sell */
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
  /** weak links to surface. default 5 */
  maxSuggestions?: number;
  /** replacements per suggestion. default 3 */
  maxCandidatesPerSuggestion?: number;
  /** protecting a lead beats marginal points, so no hits at all */
  isLeadingALeague?: boolean;
}

/**
 * free transfers go on any positive swap since they cost nothing. one hit on
 * top at most, and only if it clears the cost by HIT_SAFETY_MARGIN.
 */
function pickRecommendedCount(
  gainsDescending: number[],
  freeTransfers: number,
  allowHits: boolean,
): { count: number; pointsHitCost: number; projectedNetGain: number } {
  const freeCount = Math.min(freeTransfers, gainsDescending.length);
  const sum = (n: number) => gainsDescending.slice(0, n).reduce((a, b) => a + b, 0);

  const nextGain = gainsDescending[freeCount];
  const hitIsWorthIt =
    allowHits &&
    MAX_HITS_PER_WEEK > 0 &&
    nextGain !== undefined &&
    nextGain > POINTS_PER_HIT + HIT_SAFETY_MARGIN;

  const count = hitIsWorthIt ? freeCount + 1 : freeCount;
  const pointsHitCost = hitIsWorthIt ? POINTS_PER_HIT : 0;

  return { count, pointsHitCost, projectedNetGain: sum(count) - pointsHitCost };
}

export function analyzeTransfers(
  squad: SquadContext,
  fullPlayerPool: AnalysisPlayer[],
  options: AnalyzeTransfersOptions = {},
): TransfersAnalysis {
  const maxSuggestions = options.maxSuggestions ?? 5;
  const maxCandidatesPerSuggestion = options.maxCandidatesPerSuggestion ?? 3;
  const squadIds = new Set(squad.squad.map((p) => p.id));

  const weakestFirst = [...squad.squad].sort(
    (a, b) => scorePlayer(a) - scorePlayer(b),
  );

  const suggestions: TransferSuggestion[] = [];

  for (const outPlayer of weakestFirst.slice(0, maxSuggestions)) {
    const reasonCodes = reasonCodesFor(outPlayer);
    if (reasonCodes.length === 0) continue; // not actually a weak link

    // known simplification: budget is checked per swap, not across several
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

    const expectedPointsGain = inCandidates[0]
      ? inCandidates[0].epNext - outPlayer.epNext
      : 0;

    suggestions.push({ outPlayer, reasonCodes, inCandidates, expectedPointsGain });
  }

  // an incoming player can only be bought once, so strongest swaps pick first
  const worthConsidering = suggestions
    .filter((s) => s.expectedPointsGain > 0)
    .sort((a, b) => b.expectedPointsGain - a.expectedPointsGain);
  const usedIncomingIds = new Set<number>();
  const distinctSuggestions = worthConsidering.map((suggestion) => {
    const replacement = suggestion.inCandidates.find(
      (candidate) => !usedIncomingIds.has(candidate.id),
    );
    if (!replacement) {
      return { ...suggestion, inCandidates: [], expectedPointsGain: 0 };
    }
    usedIncomingIds.add(replacement.id);
    return {
      ...suggestion,
      // one candidate only, or the writer may pick the same player twice
      inCandidates: [replacement],
      expectedPointsGain: replacement.epNext - suggestion.outPlayer.epNext,
    };
  });
  const actionableSuggestions = distinctSuggestions.filter(
    (suggestion) => suggestion.expectedPointsGain > 0,
  );

  const { count, pointsHitCost, projectedNetGain } = pickRecommendedCount(
    actionableSuggestions.map((s) => s.expectedPointsGain),
    squad.freeTransfers,
    options.isLeadingALeague !== true,
  );

  const recommended = actionableSuggestions.slice(0, count);
  const recommendedIds = new Set(recommended.map((s) => s.outPlayer.id));
  const rest = suggestions.filter((s) => !recommendedIds.has(s.outPlayer.id));

  return {
    suggestions: [...recommended, ...rest],
    recommendedCount: count,
    freeTransfers: squad.freeTransfers,
    pointsHitCost,
    projectedNetGain,
  };
}
