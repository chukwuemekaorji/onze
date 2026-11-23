import type { AnalysisPlayer, SquadContext } from './types.js';

export type TransferReasonCode =
  'poor_form' | 'difficult_fixtures' | 'rotation_risk' | 'injury_doubt';

export interface TransferSuggestion {
  outPlayer: AnalysisPlayer;
  reasonCodes: TransferReasonCode[];
  /** best first, capped to a handful */
  inCandidates: AnalysisPlayer[];
  /**
   * gain in onze's projection for the gameweek being planned, before any hit;
   * 0 when nothing affordable exists
   */
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

export const POINTS_PER_HIT = 4;

// fpl rule since 2024/25: +1 free transfer per week, banked up to 5; any
// week's transfers use the bank first and a hit leaves 1 for the next week
export const FREE_TRANSFER_CAP = 5;

/** free transfers going into next week, after making `made` this week */
export function nextFreeTransfers(available: number, made: number): number {
  if (
    !Number.isInteger(available) ||
    !Number.isInteger(made) ||
    available < 0 ||
    made < 0
  ) {
    throw new Error(
      `free transfers must be whole numbers from 0, got ${available} and ${made}`,
    );
  }
  return Math.min(FREE_TRANSFER_CAP, Math.max(0, available - made) + 1);
}

// the gain is next gameweek's projection, so stacking hits stacks risk. allow
// one hit at most, and only when the gain clears the cost by a margin.
export const MAX_HITS_PER_WEEK = 1;
export const HIT_SAFETY_MARGIN = 2;

function avgFixtureDifficulty(player: AnalysisPlayer): number {
  if (player.nextFixtures.length === 0) return 3; // neutral when unknown
  const sum = player.nextFixtures.reduce((acc, f) => acc + f.difficulty, 0);
  return sum / player.nextFixtures.length;
}

/**
 * higher means keep, lower means sell: onze's projection over the next few
 * gameweeks, so one kind fixture doesn't decide who to buy. the gain shown is
 * still next gameweek's alone: the horizon picks who, the week decides whether
 */
export function scorePlayer(player: AnalysisPlayer): number {
  return player.projection.horizonPoints;
}

function gameweekGain(inPlayer: AnalysisPlayer, outPlayer: AnalysisPlayer): number {
  return inPlayer.projection.points - outPlayer.projection.points;
}

// below this chance of any minutes, onze calls it rotation risk even without fpl news
export const ROTATION_RISK_CHANCE = 0.6;

function reasonCodesFor(player: AnalysisPlayer): TransferReasonCode[] {
  const codes: TransferReasonCode[] = [];
  if (player.form < 3) codes.push('poor_form');
  if (avgFixtureDifficulty(player) >= 4) codes.push('difficult_fixtures');
  if (
    player.chanceOfPlayingNextRound !== null &&
    player.chanceOfPlayingNextRound <= 25
  ) {
    codes.push('injury_doubt');
  } else if (
    (player.chanceOfPlayingNextRound !== null &&
      player.chanceOfPlayingNextRound < 75) ||
    // the model reads recent minutes, so it sees a benching fpl has no flag for
    player.projection.chanceOfPlaying < ROTATION_RISK_CHANCE
  ) {
    codes.push('rotation_risk');
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

// fpl allows at most three players from any one club
export const MAX_PLAYERS_PER_CLUB = 3;
// a doubt below this is too likely to miss the game to be worth buying
export const MIN_CHANCE_OF_PLAYING = 75;

/** fit to buy: fpl marks them available and gives no real doubt */
export function isAvailableToBuy(player: AnalysisPlayer): boolean {
  return (
    player.status === 'a' &&
    (player.chanceOfPlayingNextRound === null ||
      player.chanceOfPlayingNextRound >= MIN_CHANCE_OF_PLAYING)
  );
}

/** the squad as swaps are made: money in the bank and players per club */
interface SquadState {
  bank: number;
  clubCounts: Map<number, number>;
}

function stateOf(squad: SquadContext): SquadState {
  const clubCounts = new Map<number, number>();
  for (const player of squad.squad) {
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
  }
  return { bank: squad.bank, clubCounts };
}

function canBuy(
  candidate: AnalysisPlayer,
  outPlayer: AnalysisPlayer,
  state: SquadState,
): boolean {
  // selling the outgoing player frees a place at his own club
  const clubAfterSale =
    (state.clubCounts.get(candidate.teamId) ?? 0) -
    (candidate.teamId === outPlayer.teamId ? 1 : 0);
  return (
    candidate.nowCost <= outPlayer.nowCost + state.bank &&
    clubAfterSale < MAX_PLAYERS_PER_CLUB
  );
}

function applySwap(
  state: SquadState,
  outPlayer: AnalysisPlayer,
  inPlayer: AnalysisPlayer,
): void {
  // fpl's real selling price can be lower than now_cost (only half of any rise
  // is paid out) and the public api doesn't expose it, so this is a best case
  state.bank += outPlayer.nowCost - inPlayer.nowCost;
  state.clubCounts.set(
    outPlayer.teamId,
    (state.clubCounts.get(outPlayer.teamId) ?? 1) - 1,
  );
  state.clubCounts.set(
    inPlayer.teamId,
    (state.clubCounts.get(inPlayer.teamId) ?? 0) + 1,
  );
}

function cloneState(state: SquadState): SquadState {
  return { bank: state.bank, clubCounts: new Map(state.clubCounts) };
}

export function analyzeTransfers(
  squad: SquadContext,
  fullPlayerPool: AnalysisPlayer[],
  options: AnalyzeTransfersOptions = {},
): TransfersAnalysis {
  const maxSuggestions = options.maxSuggestions ?? 5;
  const maxCandidatesPerSuggestion = options.maxCandidatesPerSuggestion ?? 3;
  const squadIds = new Set(squad.squad.map((p) => p.id));

  // everyone fit to buy who isn't already in the squad, best first
  const buyable = fullPlayerPool
    .filter((candidate) => !squadIds.has(candidate.id) && isAvailableToBuy(candidate))
    .sort((a, b) => scorePlayer(b) - scorePlayer(a));
  const rankedFor = (outPlayer: AnalysisPlayer) =>
    buyable.filter((candidate) => candidate.position === outPlayer.position);

  const weakLinks = [...squad.squad]
    .sort((a, b) => scorePlayer(a) - scorePlayer(b))
    .slice(0, maxSuggestions)
    .map((outPlayer) => ({ outPlayer, reasonCodes: reasonCodesFor(outPlayer) }))
    // a squad player with nothing wrong isn't a weak link
    .filter((link) => link.reasonCodes.length > 0);

  // first look, against the squad as it stands, only to decide the order swaps
  // are tried in: the biggest gain gets first pick of money and club places
  const startState = stateOf(squad);
  const firstLookGain = (outPlayer: AnalysisPlayer) => {
    const best = rankedFor(outPlayer).find((c) => canBuy(c, outPlayer, startState));
    return best ? gameweekGain(best, outPlayer) : 0;
  };
  const byGain = weakLinks
    .map((link) => ({ ...link, gain: firstLookGain(link.outPlayer) }))
    .filter((link) => link.gain > 0)
    .sort((a, b) => b.gain - a.gain);

  // swaps are made one after another, so each sees the bank, club places and
  // players the earlier ones used up
  const running = cloneState(startState);
  const bought = new Set<number>();
  const actionable: TransferSuggestion[] = [];
  for (const { outPlayer, reasonCodes } of byGain) {
    const replacement = rankedFor(outPlayer).find(
      (c) => !bought.has(c.id) && canBuy(c, outPlayer, running),
    );
    if (!replacement || gameweekGain(replacement, outPlayer) <= 0) continue;
    applySwap(running, outPlayer, replacement);
    bought.add(replacement.id);
    actionable.push({
      outPlayer,
      reasonCodes,
      // one candidate only, or the writer may pick the same player twice
      inCandidates: [replacement],
      expectedPointsGain: gameweekGain(replacement, outPlayer),
    });
  }

  const { count, pointsHitCost, projectedNetGain } = pickRecommendedCount(
    actionable.map((s) => s.expectedPointsGain),
    squad.freeTransfers,
    options.isLeadingALeague !== true,
  );
  const recommended = actionable.slice(0, count);

  // the other weak links are shown against the squad after the recommended
  // swaps, and no player is offered for more than one of them
  const afterRecommended = cloneState(startState);
  for (const s of recommended) {
    const replacement = s.inCandidates[0];
    if (replacement) applySwap(afterRecommended, s.outPlayer, replacement);
  }
  const listed = new Set(recommended.flatMap((s) => s.inCandidates.map((p) => p.id)));
  const recommendedIds = new Set(recommended.map((s) => s.outPlayer.id));
  const rest: TransferSuggestion[] = weakLinks
    .filter((link) => !recommendedIds.has(link.outPlayer.id))
    .map(({ outPlayer, reasonCodes }) => {
      const inCandidates = rankedFor(outPlayer)
        .filter((c) => !listed.has(c.id) && canBuy(c, outPlayer, afterRecommended))
        .slice(0, maxCandidatesPerSuggestion);
      for (const candidate of inCandidates) listed.add(candidate.id);
      const best = inCandidates[0];
      return {
        outPlayer,
        reasonCodes,
        inCandidates,
        expectedPointsGain: best ? gameweekGain(best, outPlayer) : 0,
      };
    });

  return {
    suggestions: [...recommended, ...rest],
    recommendedCount: count,
    freeTransfers: squad.freeTransfers,
    pointsHitCost,
    projectedNetGain,
  };
}
