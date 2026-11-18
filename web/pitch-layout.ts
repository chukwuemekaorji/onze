import type { LineupPlayer } from '../lib/analysis/lineup.js';
import type { Position } from '../lib/analysis/types.js';

export type Armband = 'captain' | 'vice' | null;

export interface PlacedPlayer {
  id: number;
  name: string;
  position: Position;
  teamShortName: string;
  x: number;
  y: number;
  armband: Armband;
  /** compressed label width when the name won't fit its slot, else null */
  labelLength: number | null;
}

export interface ArmbandIds {
  captainId: number | null;
  viceCaptainId: number | null;
}

export interface RowLayout {
  width: number;
  /** keeps wide players clear of the touchline */
  sideMargin: number;
  labelFontSize: number;
  /** gap kept between neighbouring labels */
  labelGap: number;
}

// how far down the pitch each line sits, as a fraction of its length.
// the opponent's goal is at the top, ours at the bottom
export const ROW_DEPTH: Record<Position, number> = {
  FWD: 0.2,
  // high enough that names clear the halfway line
  MID: 0.41,
  DEF: 0.66,
  GK: 0.89,
};

const ROWS_TOP_TO_BOTTOM: Position[] = ['FWD', 'MID', 'DEF', 'GK'];

// average glyph width as a share of font size for a bold grotesque. an estimate,
// since svg can't measure text before it renders
const AVERAGE_GLYPH_WIDTH_EM = 0.58;

export function estimateLabelWidth(name: string, fontSize: number): number {
  return name.length * fontSize * AVERAGE_GLYPH_WIDTH_EM;
}

/** the width to squeeze a label into, or null when it already fits */
export function fitLabel(
  name: string,
  maxWidth: number,
  fontSize: number,
): number | null {
  return estimateLabelWidth(name, fontSize) > maxWidth ? maxWidth : null;
}

function armbandFor(playerId: number, ids: ArmbandIds): Armband {
  if (playerId === ids.captainId) return 'captain';
  if (playerId === ids.viceCaptainId) return 'vice';
  return null;
}

/** spreads players evenly across equal-width slots in one row */
export function placeRow(
  players: LineupPlayer[],
  y: number,
  layout: RowLayout,
  ids: ArmbandIds,
): PlacedPlayer[] {
  if (players.length === 0) return [];
  const slotWidth = (layout.width - 2 * layout.sideMargin) / players.length;
  const maxLabelWidth = slotWidth - layout.labelGap;

  return players.map(({ player }, index) => ({
    id: player.id,
    name: player.webName,
    position: player.position,
    teamShortName: player.teamShortName,
    x: layout.sideMargin + slotWidth * (index + 0.5),
    y,
    armband: armbandFor(player.id, ids),
    labelLength: fitLabel(player.webName, maxLabelWidth, layout.labelFontSize),
  }));
}

/** the recommended xi in formation, one row per position */
export function placeStartingXI(
  startingXI: LineupPlayer[],
  pitchLength: number,
  layout: RowLayout,
  ids: ArmbandIds,
): PlacedPlayer[] {
  return ROWS_TOP_TO_BOTTOM.flatMap((position) =>
    placeRow(
      startingXI.filter((p) => p.player.position === position),
      ROW_DEPTH[position] * pitchLength,
      layout,
      ids,
    ),
  );
}
