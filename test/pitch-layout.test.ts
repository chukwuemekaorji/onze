import { describe, expect, it } from 'vitest';
import type { LineupPlayer } from '../lib/analysis/lineup.js';
import type { AnalysisPlayer, Position } from '../lib/analysis/types.js';
import {
  estimateLabelWidth,
  fitLabel,
  placeRow,
  placeStartingXI,
  ROW_DEPTH,
} from '../web/pitch-layout.js';
import type { RowLayout } from '../web/pitch-layout.js';

const LAYOUT: RowLayout = {
  width: 680,
  sideMargin: 40,
  labelFontSize: 25,
  labelGap: 10,
};
const PITCH_LENGTH = 1050;
const NO_ARMBANDS = { captainId: null, viceCaptainId: null };

let nextId = 1;
function lineupPlayer(position: Position, webName = `P${nextId}`): LineupPlayer {
  const player = { id: nextId++, webName, position, teamShortName: 'TST' };
  // only the fields the layout reads
  return { player: player as AnalysisPlayer, score: 0 };
}

function formation(def: number, mid: number, fwd: number): LineupPlayer[] {
  return [
    lineupPlayer('GK'),
    ...Array.from({ length: def }, () => lineupPlayer('DEF')),
    ...Array.from({ length: mid }, () => lineupPlayer('MID')),
    ...Array.from({ length: fwd }, () => lineupPlayer('FWD')),
  ];
}

describe('placeStartingXI', () => {
  it('puts each line at its depth with the goalkeeper at the bottom', () => {
    const placed = placeStartingXI(
      formation(3, 4, 3),
      PITCH_LENGTH,
      LAYOUT,
      NO_ARMBANDS,
    );

    expect(placed).toHaveLength(11);
    const depthOf = (position: Position) =>
      new Set(placed.filter((p) => p.position === position).map((p) => p.y));
    expect(depthOf('GK')).toEqual(new Set([ROW_DEPTH.GK * PITCH_LENGTH]));
    expect(depthOf('FWD')).toEqual(new Set([ROW_DEPTH.FWD * PITCH_LENGTH]));
    expect(ROW_DEPTH.GK).toBeGreaterThan(ROW_DEPTH.DEF);
    expect(ROW_DEPTH.DEF).toBeGreaterThan(ROW_DEPTH.MID);
    expect(ROW_DEPTH.MID).toBeGreaterThan(ROW_DEPTH.FWD);
  });

  it('keeps a five-man line inside the touchline margins, left to right', () => {
    const placed = placeStartingXI(
      formation(5, 3, 2),
      PITCH_LENGTH,
      LAYOUT,
      NO_ARMBANDS,
    );
    const defenders = placed.filter((p) => p.position === 'DEF').map((p) => p.x);

    expect(defenders).toEqual([...defenders].sort((a, b) => a - b));
    expect(Math.min(...defenders)).toBeGreaterThan(LAYOUT.sideMargin);
    expect(Math.max(...defenders)).toBeLessThan(LAYOUT.width - LAYOUT.sideMargin);
  });

  it('centres a lone striker and goalkeeper', () => {
    const placed = placeStartingXI(
      formation(4, 5, 1),
      PITCH_LENGTH,
      LAYOUT,
      NO_ARMBANDS,
    );
    for (const position of ['GK', 'FWD'] as const) {
      expect(placed.find((p) => p.position === position)?.x).toBe(LAYOUT.width / 2);
    }
  });

  it('marks the captain and vice-captain only', () => {
    const xi = formation(4, 4, 2);
    const [keeper, defender] = xi as [LineupPlayer, LineupPlayer];
    const placed = placeStartingXI(xi, PITCH_LENGTH, LAYOUT, {
      captainId: defender.player.id,
      viceCaptainId: keeper.player.id,
    });

    expect(placed.find((p) => p.id === defender.player.id)?.armband).toBe('captain');
    expect(placed.find((p) => p.id === keeper.player.id)?.armband).toBe('vice');
    expect(placed.filter((p) => p.armband === null)).toHaveLength(9);
  });

  it('returns nothing for an empty lineup', () => {
    expect(placeStartingXI([], PITCH_LENGTH, LAYOUT, NO_ARMBANDS)).toEqual([]);
  });
});

describe('placeRow', () => {
  it('returns nothing for an empty row', () => {
    expect(placeRow([], 50, LAYOUT, NO_ARMBANDS)).toEqual([]);
  });

  it('squeezes only the names too long for their slot', () => {
    const row = [
      lineupPlayer('DEF', 'Alexander-Arnold'),
      lineupPlayer('DEF', 'Saka'),
      lineupPlayer('DEF', 'Gabriel'),
      lineupPlayer('DEF', 'Gvardiol'),
      lineupPlayer('DEF', 'Pedro Porro'),
    ];
    const placed = placeRow(row, 50, LAYOUT, NO_ARMBANDS);
    const slotWidth = (LAYOUT.width - 2 * LAYOUT.sideMargin) / row.length;

    expect(placed[0]?.labelLength).toBe(slotWidth - LAYOUT.labelGap);
    expect(placed[1]?.labelLength).toBeNull();
  });
});

describe('fitLabel', () => {
  it('leaves a short name alone and caps a long one at the max width', () => {
    expect(fitLabel('Saka', 200, 25)).toBeNull();
    expect(fitLabel('Alexander-Arnold', 100, 25)).toBe(100);
  });

  it('treats an empty name as fitting', () => {
    expect(estimateLabelWidth('', 25)).toBe(0);
    expect(fitLabel('', 0, 25)).toBeNull();
  });
});
