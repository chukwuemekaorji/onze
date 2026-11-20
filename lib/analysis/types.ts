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
  /**
   * fpl's own next-gameweek figure, in practice form scaled by availability.
   * kept only to show next to onze's projection; nothing decides on it
   */
  epNext: number;
  /** onze's projection, from lib/analysis/projection.ts with fpl's team news applied */
  projection: PlayerProjection;
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

/** onze's numbers for one player, all for the gameweek being planned unless named */
export interface PlayerProjection {
  /** the gameweek these are for */
  event: number;
  /** projected points: chance of playing x points if playing, over the gameweek's fixtures */
  points: number;
  /** 0 to 1: the model's chance of any minutes, times fpl's team news */
  chanceOfPlaying: number;
  /** projected points if he plays, all of the gameweek's fixtures; 0 in a blank */
  pointsIfPlaying: number;
  /** the part of pointsIfPlaying from defensive contributions (2025-26 rules on) */
  defensiveContributionIfPlaying: number;
  /** projected points over the next horizonEvents gameweeks, for weighing transfers */
  horizonPoints: number;
  horizonEvents: number;
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
