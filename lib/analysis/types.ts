/** plain analysis data; build-context.ts maps raw fpl payloads into these */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface FixtureDifficulty {
  event: number;
  isHome: boolean;
  difficulty: number;
  opponentShortName: string;
}

export interface AnalysisPlayer {
  id: number;
  webName: string;
  teamId: number;
  teamShortName: string;
  position: Position;
  /** fpl cost units: 55 means £5.5m */
  nowCost: number;
  form: number;
  epNext: number;
  totalPoints: number;
  selectedByPercent: number;
  /** 0-100, or null when fpl reports no fitness doubt */
  chanceOfPlayingNextRound: number | null;
  costChangeEvent: number;
  transfersInEvent: number;
  transfersOutEvent: number;
  /** soonest first, limited to the next few gameweeks */
  nextFixtures: FixtureDifficulty[];
}

export interface SquadPick {
  elementId: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
}

export interface SquadContext {
  /** the gameweek being planned for */
  currentEvent: number;
  /** same unit as nowCost: 3 means £0.3m */
  bank: number;
  /** banked going into currentEvent, capped at 5 */
  freeTransfers: number;
  squad: AnalysisPlayer[];
  picks: SquadPick[];
}

/** a mini-league the manager joined; fpl system leagues nobody wins are excluded */
export interface LeagueStanding {
  id: number;
  name: string;
  rank: number;
  previousRank: number;
  totalEntries: number;
}
