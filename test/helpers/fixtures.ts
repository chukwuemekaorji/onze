import type { AnalysisPlayer, SquadContext } from '../../lib/analysis/types.js';

let nextId = 1;

export function makePlayer(overrides: Partial<AnalysisPlayer> = {}): AnalysisPlayer {
  const id = overrides.id ?? nextId++;
  return {
    id,
    webName: `Player${id}`,
    teamId: 1,
    teamShortName: 'AAA',
    position: 'MID',
    nowCost: 50,
    form: 5,
    pointsPerGame: 5,
    epNext: 5,
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
