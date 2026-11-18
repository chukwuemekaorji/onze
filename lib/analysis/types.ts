/** plain analysis data; build-context.ts maps raw fpl payloads into these */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/**
 * fpl's availability flag: a available, d doubtful, i injured, s suspended,
 * u unavailable (left the club), n not eligible (on loan)
 */
export type PlayerStatus = 'a' | 'd' | 'i' | 's' | 'u' | 'n';

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
  /** points per match over the last 30 days */
  form: number;
  /** season average, steadier than form */
  pointsPerGame: number;
  /** fpl's own next-gameweek figure; in practice form scaled by availability */
  epNext: number;
  totalPoints: number;
  selectedByPercent: number;
  /** 0-100, or null when fpl reports no fitness doubt */
  chanceOfPlayingNextRound: number | null;
  status: PlayerStatus;
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
