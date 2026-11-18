import { describe, expect, it } from 'vitest';
import type { LineupPlayer } from '../lib/analysis/lineup.js';
import type {
  AnalysisPlayer,
  FixtureDifficulty,
  Position,
} from '../lib/analysis/types.js';
import {
  benchInFplOrder,
  incomingNote,
  incomingTransfers,
  estimateLabelWidth,
  fitLabel,
  fixtureLabel,
  placeRow,
  placeStartingXI,
  ROW_DEPTH,
  shirtNumbers,
} from '../web/pitch-layout.js';
import type { ArmbandIds, PlacementContext, RowLayout } from '../web/pitch-layout.js';

const LAYOUT: RowLayout = {
  width: 680,
  sideMargin: 40,
  labelFontSize: 25,
  fixtureFontSize: 20,
  labelGap: 10,
};
const PITCH_LENGTH = 1050;
const EVENT = 12;
const NO_ARMBANDS: ArmbandIds = { captainId: null, viceCaptainId: null };

function context(
  ids: ArmbandIds = NO_ARMBANDS,
  xi: LineupPlayer[] = [],
): PlacementContext {
  return {
    ids,
    shirtNumbers: shirtNumbers({ startingXI: xi, bench: [] }),
    event: EVENT,
  };
}

function fixture(event: number, opponent: string, isHome: boolean): FixtureDifficulty {
  return { event, opponentShortName: opponent, isHome, difficulty: 3 };
}

let nextId = 1;
function lineupPlayer(
  position: Position,
  webName = `P${nextId}`,
  nextFixtures: FixtureDifficulty[] = [fixture(EVENT, 'LIV', true)],
): LineupPlayer {
  const player = {
    id: nextId++,
    webName,
    position,
    teamShortName: 'TST',
    nextFixtures,
  };
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
    const placed = placeStartingXI(formation(3, 4, 3), PITCH_LENGTH, LAYOUT, context());

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
    const placed = placeStartingXI(formation(5, 3, 2), PITCH_LENGTH, LAYOUT, context());
    const defenders = placed.filter((p) => p.position === 'DEF').map((p) => p.x);

    expect(defenders).toEqual([...defenders].sort((a, b) => a - b));
    expect(Math.min(...defenders)).toBeGreaterThan(LAYOUT.sideMargin);
    expect(Math.max(...defenders)).toBeLessThan(LAYOUT.width - LAYOUT.sideMargin);
  });

  it('centres a lone striker and goalkeeper', () => {
    const placed = placeStartingXI(formation(4, 5, 1), PITCH_LENGTH, LAYOUT, context());
    for (const position of ['GK', 'FWD'] as const) {
      expect(placed.find((p) => p.position === position)?.x).toBe(LAYOUT.width / 2);
    }
  });

  it('marks the captain and vice-captain only', () => {
    const xi = formation(4, 4, 2);
    const [keeper, defender] = xi as [LineupPlayer, LineupPlayer];
    const placed = placeStartingXI(
      xi,
      PITCH_LENGTH,
      LAYOUT,
      context({ captainId: defender.player.id, viceCaptainId: keeper.player.id }),
    );

    expect(placed.find((p) => p.id === defender.player.id)?.armband).toBe('captain');
    expect(placed.find((p) => p.id === keeper.player.id)?.armband).toBe('vice');
    expect(placed.filter((p) => p.armband === null)).toHaveLength(9);
  });

  it('carries each player shirt number and fixture', () => {
    const xi = formation(4, 4, 2);
    const placed = placeStartingXI(xi, PITCH_LENGTH, LAYOUT, context(NO_ARMBANDS, xi));

    expect(placed.find((p) => p.position === 'GK')?.shirtNumber).toBe(1);
    expect(placed.every((p) => p.fixture === 'LIV (H)')).toBe(true);
  });

  it('returns nothing for an empty lineup', () => {
    expect(placeStartingXI([], PITCH_LENGTH, LAYOUT, context())).toEqual([]);
  });
});

describe('shirtNumbers', () => {
  it('numbers the xi 1 to 11 in formation order and the bench 12 to 15', () => {
    // deliberately shuffled, the numbering must still go gk, def, mid, fwd
    const fwd = lineupPlayer('FWD');
    const gk = lineupPlayer('GK');
    const mids = [lineupPlayer('MID'), lineupPlayer('MID'), lineupPlayer('MID')];
    const defs = [lineupPlayer('DEF'), lineupPlayer('DEF'), lineupPlayer('DEF')];
    const moreFwds = [lineupPlayer('FWD'), lineupPlayer('FWD')];
    const xi = [fwd, ...mids, gk, ...defs, ...moreFwds, lineupPlayer('MID')];
    const bench = [
      lineupPlayer('DEF'),
      lineupPlayer('MID'),
      lineupPlayer('FWD'),
      lineupPlayer('GK'),
    ];

    const numbers = shirtNumbers({ startingXI: xi, bench });
    const numberOf = (p: LineupPlayer) => numbers.get(p.player.id);

    expect(numberOf(gk)).toBe(1);
    expect(defs.map(numberOf)).toEqual([2, 3, 4]);
    expect(mids.map(numberOf)).toEqual([5, 6, 7]);
    expect(numberOf(fwd)).toBe(9);
    expect(moreFwds.map(numberOf)).toEqual([10, 11]);
    // fpl's bench order: the substitute keeper first, then the outfield subs
    const [benchDef, benchMid, benchFwd, benchGk] = bench as [
      LineupPlayer,
      LineupPlayer,
      LineupPlayer,
      LineupPlayer,
    ];
    expect([benchGk, benchDef, benchMid, benchFwd].map(numberOf)).toEqual([
      12, 13, 14, 15,
    ]);
  });

  it('keeps the same order as the players are placed left to right', () => {
    const xi = formation(4, 4, 2);
    const numbers = shirtNumbers({ startingXI: xi, bench: [] });
    const defenders = placeStartingXI(
      xi,
      PITCH_LENGTH,
      LAYOUT,
      context(NO_ARMBANDS, xi),
    )
      .filter((p) => p.position === 'DEF')
      .map((p) => numbers.get(p.id));

    expect(defenders).toEqual([2, 3, 4, 5]);
  });

  it('returns an empty map for an empty lineup', () => {
    expect(shirtNumbers({ startingXI: [], bench: [] }).size).toBe(0);
  });
});

describe('benchInFplOrder', () => {
  it('puts the substitute keeper first and keeps the outfield order', () => {
    const def = lineupPlayer('DEF');
    const mid = lineupPlayer('MID');
    const gk = lineupPlayer('GK');
    expect(benchInFplOrder([def, mid, gk])).toEqual([gk, def, mid]);
  });

  it('leaves a bench without a keeper, or an empty one, as it is', () => {
    const def = lineupPlayer('DEF');
    const fwd = lineupPlayer('FWD');
    expect(benchInFplOrder([def, fwd])).toEqual([def, fwd]);
    expect(benchInFplOrder([])).toEqual([]);
  });
});

describe('fixtureLabel', () => {
  it('shows the opponent and venue for the planned gameweek only', () => {
    const fixtures = [fixture(EVENT, 'CHE', false), fixture(EVENT + 1, 'ARS', true)];
    expect(fixtureLabel(fixtures, EVENT)).toBe('CHE (A)');
  });

  it('lists both games in a double gameweek', () => {
    const fixtures = [fixture(EVENT, 'LIV', true), fixture(EVENT, 'EVE', false)];
    expect(fixtureLabel(fixtures, EVENT)).toBe('LIV (H) + EVE (A)');
  });

  it('says blank when the team has no game that week', () => {
    expect(fixtureLabel([fixture(EVENT + 1, 'ARS', true)], EVENT)).toBe('Blank');
    expect(fixtureLabel([], EVENT)).toBe('Blank');
  });
});

describe('placeRow', () => {
  it('returns nothing for an empty row', () => {
    expect(placeRow([], 50, LAYOUT, context())).toEqual([]);
  });

  it('squeezes only the names too long for their slot', () => {
    const row = [
      lineupPlayer('DEF', 'Alexander-Arnold'),
      lineupPlayer('DEF', 'Saka'),
      lineupPlayer('DEF', 'Gabriel'),
      lineupPlayer('DEF', 'Gvardiol'),
      lineupPlayer('DEF', 'Pedro Porro'),
    ];
    const placed = placeRow(row, 50, LAYOUT, context());
    const maxLabelWidth =
      (LAYOUT.width - 2 * LAYOUT.sideMargin) / row.length - LAYOUT.labelGap;

    expect(placed[0]?.labelLength).toBe(maxLabelWidth);
    expect(placed[0]?.labelWidth).toBe(maxLabelWidth);
    expect(placed[1]?.labelLength).toBeNull();
    expect(placed[1]?.labelWidth).toBe(
      estimateLabelWidth('Saka', LAYOUT.labelFontSize),
    );
  });

  it('gives a player missing from the numbering no shirt number', () => {
    const [placed] = placeRow([lineupPlayer('MID')], 50, LAYOUT, context());
    expect(placed?.shirtNumber).toBeNull();
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

describe('incomingTransfers', () => {
  const swap = (outName: string, inPlayer: LineupPlayer | null) => ({
    outPlayer: lineupPlayer('MID', outName).player,
    reasonCodes: [],
    inCandidates: inPlayer ? [inPlayer.player] : [],
    expectedPointsGain: 3,
  });

  it('maps each recommended arrival to the player they replace', () => {
    const isak = lineupPlayer('FWD', 'Isak');
    const saka = lineupPlayer('MID', 'Saka');
    const skipped = lineupPlayer('MID', 'Palmer');
    const incoming = incomingTransfers({
      suggestions: [swap('Wissa', isak), swap('Mitoma', saka), swap('Gordon', skipped)],
      recommendedCount: 2,
    });
    expect([...incoming]).toEqual([
      [isak.player.id, 'Wissa'],
      [saka.player.id, 'Mitoma'],
    ]);
  });

  it('brings no one in for a move with no affordable replacement, or none recommended', () => {
    expect(
      incomingTransfers({ suggestions: [swap('Wissa', null)], recommendedCount: 1 })
        .size,
    ).toBe(0);
    expect(incomingTransfers({ suggestions: [], recommendedCount: 0 }).size).toBe(0);
  });

  it('marks the arrival on the pitch with a note that fits its slot', () => {
    const arrival = lineupPlayer('MID', 'Saka');
    const [placed] = placeRow([arrival], 50, LAYOUT, {
      ...context(),
      incoming: new Map([[arrival.player.id, 'Mitoma']]),
    });
    expect(placed?.incomingFor).toBe('Mitoma');
    expect(incomingNote('Mitoma')).toBe('in for Mitoma');
    expect(placed?.incomingNoteLength).toBeNull();

    const [others] = placeRow([lineupPlayer('MID')], 50, LAYOUT, context());
    expect(others?.incomingFor).toBeNull();
  });

  it('squeezes a long note into a narrow slot', () => {
    const row = Array.from({ length: 5 }, () => lineupPlayer('DEF'));
    const [first] = placeRow(row, 50, LAYOUT, {
      ...context(),
      incoming: new Map([[row[0]!.player.id, 'Alexander-Arnold-Smithson']]),
    });
    expect(first?.incomingNoteLength).not.toBeNull();
  });
});
