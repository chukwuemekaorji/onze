import type { TransferPlan } from '../../lib/analysis/planner.js';
import type {
  AnalysisPlayer,
  PlayerProjection,
  SquadContext,
} from '../../lib/analysis/types.js';

let nextId = 1;

/** a projection for gameweek 1, the default fixture's gameweek */
export function makeProjection(
  overrides: Partial<PlayerProjection> = {},
): PlayerProjection {
  const points = overrides.points ?? 5;
  return {
    event: 1,
    points,
    chanceOfPlaying: 0.9,
    pointsIfPlaying: points / 0.9,
    goalOrAssistChance: 0.3,
    cleanSheetChance: null,
    // the same every week unless a test says otherwise
    horizonPoints: points * 3,
    horizonEvents: 3,
    weeklyPoints: [points, points, points, points, points],
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<AnalysisPlayer> = {}): AnalysisPlayer {
  const id = overrides.id ?? nextId++;
  return {
    id,
    webName: `Player${id}`,
    teamId: 1,
    teamShortName: 'AAA',
    teamName: 'Alpha',
    position: 'MID',
    nowCost: 50,
    form: 5,
    pointsPerGame: 5,
    epNext: 5,
    projection: makeProjection(),
    totalPoints: 50,
    selectedByPercent: 10,
    chanceOfPlayingNextRound: null,
    status: 'a',
    costChangeEvent: 0,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    nextFixtures: [{ event: 1, isHome: true, difficulty: 3, opponentShortName: 'BBB' }],
    ...overrides,
  };
}

export function makeSquadContext(overrides: Partial<SquadContext> = {}): SquadContext {
  const squad = overrides.squad ?? [makePlayer()];
  return {
    currentEvent: 1,
    bank: 0,
    freeTransfers: 1,
    squad,
    picks: squad.map((p) => ({
      elementId: p.id,
      isCaptain: false,
      isViceCaptain: false,
      multiplier: 1,
    })),
    ...overrides,
  };
}

/** a plan with no weeks, for summaries a test doesn't plan */
export const EMPTY_PLAN: TransferPlan = {
  weeks: [],
  weekWeights: [],
  weightedPoints: 0,
  hitCost: 0,
  objective: 0,
  beamWidth: 1,
};
