import type { LineupAnalysis, LineupPlayer } from '../lib/analysis/lineup.js';
import type { TransfersAnalysis } from '../lib/analysis/transfers.js';
import type { FixtureDifficulty, Position } from '../lib/analysis/types.js';

export type Armband = 'captain' | 'vice' | null;

export interface PlacedPlayer {
  id: number;
  name: string;
  position: Position;
  teamShortName: string;
  x: number;
  y: number;
  armband: Armband;
  /** null only if the player is missing from the numbering, which shouldn't happen */
  shirtNumber: number | null;
  /** name label width: the estimate, capped at the slot */
  labelWidth: number;
  /** compressed label width when the name won't fit its slot, else null */
  labelLength: number | null;
  /** e.g. "LIV (H)", both games in a double, "Blank" in a blank */
  fixture: string;
  fixtureLength: number | null;
  /** the outgoing player's name when this one is a recommended transfer in */
  incomingFor: string | null;
  /** compressed width for the "in for" note when it won't fit, else null */
  incomingNoteLength: number | null;
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
  fixtureFontSize: number;
  /** gap kept between neighbouring labels */
  labelGap: number;
}

export interface PlacementContext {
  ids: ArmbandIds;
  shirtNumbers: ReadonlyMap<number, number>;
  /** the gameweek the lineup is picked for */
  event: number;
  /** recommended arrivals: incoming player id to the name they replace */
  incoming?: ReadonlyMap<number, string>;
}

// how far down the pitch each line sits, as a fraction of its length.
// the opponent's goal is at the top, ours at the bottom
export const ROW_DEPTH: Record<Position, number> = {
  FWD: 0.17,
  // high enough that labels clear the halfway line
  MID: 0.38,
  DEF: 0.62,
  GK: 0.84,
};

const ROWS_TOP_TO_BOTTOM: Position[] = ['FWD', 'MID', 'DEF', 'GK'];
const FORMATION_ORDER: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

// fpl has no reliable squad numbers, so shirts are numbered by slot instead
const FIRST_BENCH_NUMBER = 12;

// average glyph width as a share of font size. an estimate, since svg can't
// measure text before it renders
export const NAME_GLYPH_WIDTH_EM = 0.58;
// caveat is a narrow hand, so the "in for" note packs in more per unit width
export const HAND_GLYPH_WIDTH_EM = 0.42;

export function incomingNote(outgoingName: string): string {
  return `in for ${outgoingName}`;
}

// fixtures are set in the body font at a regular weight, a little narrower
export const FIXTURE_GLYPH_WIDTH_EM = 0.52;

export function estimateLabelWidth(
  text: string,
  fontSize: number,
  glyphWidthEm: number = NAME_GLYPH_WIDTH_EM,
): number {
  return text.length * fontSize * glyphWidthEm;
}

/** the width to squeeze a label into, or null when it already fits */
export function fitLabel(
  text: string,
  maxWidth: number,
  fontSize: number,
  glyphWidthEm: number = NAME_GLYPH_WIDTH_EM,
): number | null {
  return estimateLabelWidth(text, fontSize, glyphWidthEm) > maxWidth ? maxWidth : null;
}

/**
 * fpl lists the substitute keeper first on the bench, then the outfield subs
 * in the order they'd come on. the analysis keeps them best first, keeper last
 */
export function benchInFplOrder(bench: LineupPlayer[]): LineupPlayer[] {
  const isKeeper = (p: LineupPlayer) => p.player.position === 'GK';
  return [...bench.filter(isKeeper), ...bench.filter((p) => !isKeeper(p))];
}

/** 1 to 11 for the xi in formation order (gk, def, mid, fwd), 12 up for the bench */
export function shirtNumbers(
  lineup: Pick<LineupAnalysis, 'startingXI' | 'bench'>,
): Map<number, number> {
  const inFormationOrder = FORMATION_ORDER.flatMap((position) =>
    lineup.startingXI.filter((p) => p.player.position === position),
  );
  const numbers = new Map<number, number>();
  inFormationOrder.forEach(({ player }, index) => numbers.set(player.id, index + 1));
  benchInFplOrder(lineup.bench).forEach(({ player }, index) =>
    numbers.set(player.id, FIRST_BENCH_NUMBER + index),
  );
  return numbers;
}

/**
 * the recommended moves as incoming player id to outgoing name, so the pitch can
 * ring each new arrival. a move with no affordable replacement brings no one in
 */
export function incomingTransfers(
  transfers: Pick<TransfersAnalysis, 'suggestions' | 'recommendedCount'>,
): Map<number, string> {
  const incoming = new Map<number, string>();
  for (const suggestion of transfers.suggestions.slice(0, transfers.recommendedCount)) {
    const arrival = suggestion.inCandidates[0];
    if (arrival) incoming.set(arrival.id, suggestion.outPlayer.webName);
  }
  return incoming;
}

/** the player's games in one gameweek: "LIV (H)", "LIV (H) + CHE (A)" or "Blank" */
export function fixtureLabel(fixtures: FixtureDifficulty[], event: number): string {
  const games = fixtures.filter((fixture) => fixture.event === event);
  if (games.length === 0) return 'Blank';
  return games
    .map((game) => `${game.opponentShortName} (${game.isHome ? 'H' : 'A'})`)
    .join(' + ');
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
  context: PlacementContext,
): PlacedPlayer[] {
  if (players.length === 0) return [];
  const slotWidth = (layout.width - 2 * layout.sideMargin) / players.length;
  const maxLabelWidth = slotWidth - layout.labelGap;

  return players.map(({ player }, index) => {
    const fixture = fixtureLabel(player.nextFixtures, context.event);
    const incomingFor = context.incoming?.get(player.id) ?? null;
    return {
      id: player.id,
      name: player.webName,
      position: player.position,
      teamShortName: player.teamShortName,
      x: layout.sideMargin + slotWidth * (index + 0.5),
      y,
      armband: armbandFor(player.id, context.ids),
      shirtNumber: context.shirtNumbers.get(player.id) ?? null,
      labelWidth: Math.min(
        estimateLabelWidth(player.webName, layout.labelFontSize),
        maxLabelWidth,
      ),
      labelLength: fitLabel(player.webName, maxLabelWidth, layout.labelFontSize),
      fixture,
      fixtureLength: fitLabel(
        fixture,
        maxLabelWidth,
        layout.fixtureFontSize,
        FIXTURE_GLYPH_WIDTH_EM,
      ),
      incomingFor,
      incomingNoteLength:
        incomingFor === null
          ? null
          : fitLabel(
              incomingNote(incomingFor),
              maxLabelWidth,
              layout.labelFontSize,
              HAND_GLYPH_WIDTH_EM,
            ),
    };
  });
}

/** the recommended xi in formation, one row per position */
export function placeStartingXI(
  startingXI: LineupPlayer[],
  pitchLength: number,
  layout: RowLayout,
  context: PlacementContext,
): PlacedPlayer[] {
  return ROWS_TOP_TO_BOTTOM.flatMap((position) =>
    placeRow(
      startingXI.filter((p) => p.player.position === position),
      ROW_DEPTH[position] * pitchLength,
      layout,
      context,
    ),
  );
}
