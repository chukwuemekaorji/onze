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
  /** Best in-candidate's ep_next minus outPlayer's — the projected point swing from this one transfer, before any hit cost. 0 when there's no affordable replacement. */
  expectedPointsGain: number;
}

export interface TransfersAnalysis {
  /** Ranked best-first by expectedPointsGain; not all of these are necessarily worth making — see recommendedCount. */
  suggestions: TransferSuggestion[];
  /** How many of the leading `suggestions` are actually worth making this gameweek, once hit cost is weighed against free transfers. Can be 0. */
  recommendedCount: number;
  /** Free transfers available going into this gameweek (from SquadContext). */
  freeTransfers: number;
  /** Total point cost (-4 each) of the recommended transfers beyond the free ones. */
  pointsHitCost: number;
  /** Sum of the recommended transfers' expectedPointsGain minus pointsHitCost. */
  projectedNetGain: number;
}

const FORM_WEIGHT = 2;
const FIXTURE_DIFFICULTY_WEIGHT = 1.5;
const EP_NEXT_WEIGHT = 1;

// FPL's standard cost of a transfer beyond your free allowance.
export const POINTS_PER_HIT = 4;

// Real FPL wisdom: taking more than a single -4 hit in one week is a
// gamble almost never worth it — ep_next is a single-gameweek estimate,
// not a guarantee, so stacking several hits compounds that uncertainty
// instead of compounding value. Cap it at one hit per week, and even
// that one has to clear the cost by a safety margin, not just edge past
// break-even, before it's worth recommending.
const MAX_HITS_PER_WEEK = 1;
const HIT_SAFETY_MARGIN = 2;

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
  /** How many weak-link transfer-out candidates to surface. Default 5. */
  maxSuggestions?: number;
  /** How many replacement candidates per suggestion. Default 3. */
  maxCandidatesPerSuggestion?: number;
  /**
   * True if the manager is currently 1st in any of their own classic
   * leagues. Leading a league means protecting the spot matters more
   * than squeezing out marginal points — so hits are off entirely, no
   * matter how favorable the gain, even the one hit normally allowed.
   */
  isLeadingALeague?: boolean;
}

/**
 * How many of the gain-ranked suggestions are actually worth making,
 * given the free transfers banked. Free transfers are always worth
 * spending on a positive-gain swap (no downside). Beyond that, at most
 * one hit-funded transfer gets recommended (MAX_HITS_PER_WEEK), and only
 * when its gain clears the -4 cost by HIT_SAFETY_MARGIN — a thin,
 * technically-positive edge isn't worth gambling a hit on. Hits are
 * skipped entirely while leading a league — there's nothing to gain
 * from a gamble that's already working.
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

    // Budget is checked per suggestion against the squad's actual bank,
    // not chained across multiple recommended transfers — simultaneously
    // affording several transfers depends on the net cost of all of them
    // together, which this model doesn't attempt to solve for.
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

  // A transfer plan is a set of swaps, so one incoming player can only be
  // used once. Assign the strongest swaps first and give each later swap its
  // next best still-available candidate.
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
      // Keep the emitted recommendation unambiguous. If alternatives are
      // included here, the prose writer may independently choose the same
      // player for another transfer.
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
