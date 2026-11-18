/**
 * Shared types for the analysis layer. Everything here is plain data —
 * no FPL raw payload shapes, no prose. lib/build-context.ts maps raw FPL
 * API responses into these; lib/analysis/*.ts only ever sees this shape.
 */

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
  /** FPL cost units: 55 means £5.5m. */
  nowCost: number;
  form: number;
  epNext: number;
  totalPoints: number;
  selectedByPercent: number;
  /** 0-100, or null when FPL reports no doubt over fitness. */
  chanceOfPlayingNextRound: number | null;
  costChangeEvent: number;
  transfersInEvent: number;
  transfersOutEvent: number;
  /** Ordered soonest-first, capped by the caller to "next N" gameweeks. */
  nextFixtures: FixtureDifficulty[];
}

export interface SquadPick {
  elementId: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
}

export interface SquadContext {
  /** The gameweek being planned for (captaincy/transfers target this event). */
  currentEvent: number;
  /** Same unit as AnalysisPlayer.nowCost (tenths of a million, e.g. 3 = £0.3m). */
  bank: number;
  squad: AnalysisPlayer[];
  picks: SquadPick[];
}
