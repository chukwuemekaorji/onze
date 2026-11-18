import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { AnalysisPlayer } from '../lib/analysis/types.js';
import {
  captainOptions,
  captainSummaryLine,
  chipStamps,
  formatGain,
  formatPrice,
  gameweekTimeline,
  hitAdvice,
  priceRows,
  transferRows,
  transferSummaryLine,
} from '../web/report-view.js';

const EVENT = 12;

let nextId = 1;
function player(
  webName: string,
  overrides: Partial<AnalysisPlayer> = {},
): AnalysisPlayer {
  return {
    id: nextId++,
    webName,
    teamId: 1,
    teamShortName: 'TST',
    position: 'MID',
    nowCost: 80,
    form: 5,
    epNext: 5,
    totalPoints: 50,
    selectedByPercent: 10,
    chanceOfPlayingNextRound: null,
    costChangeEvent: 0,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    nextFixtures: [
      { event: EVENT, opponentShortName: 'LIV', isHome: true, difficulty: 3 },
    ],
    ...overrides,
  };
}

function suggestion(
  outName: string,
  inName: string | null,
  gain: number,
  alternatives: AnalysisPlayer[] = [],
) {
  return {
    outPlayer: player(outName),
    reasonCodes: [],
    inCandidates: inName ? [player(inName), ...alternatives] : [],
    expectedPointsGain: gain,
  };
}

function transfers(overrides: Partial<AnalysisSummary['transfers']>) {
  return {
    suggestions: [],
    recommendedCount: 0,
    freeTransfers: 1,
    pointsHitCost: 0,
    projectedNetGain: 0,
    ...overrides,
  };
}

const NOT_LEADING: AnalysisSummary['leagueStandings'] = [];
const LEADING: AnalysisSummary['leagueStandings'] = [
  { id: 1, name: 'Office', rank: 1, previousRank: 1, totalEntries: 12 },
];

describe('transferRows', () => {
  it('lists every suggestion: free first, then a hit, then the ones to skip', () => {
    const rows = transferRows(
      transfers({
        suggestions: [
          suggestion('Wissa', 'Watkins', 7.4, [player('Isak', { nowCost: 85 })]),
          suggestion('Mitoma', 'Mbeumo', 6.8),
          suggestion('Gordon', 'Palmer', 1.4),
        ],
        recommendedCount: 2,
        freeTransfers: 1,
        pointsHitCost: 4,
      }),
    );
    expect(rows.map((r) => [r.outName, r.inName, r.verdict])).toEqual([
      ['Wissa', 'Watkins', 'free'],
      ['Mitoma', 'Mbeumo', 'hit'],
      ['Gordon', 'Palmer', 'skip'],
    ]);
    expect(rows[0]?.alternatives).toEqual(['Isak £8.5m']);
    expect(rows[1]?.alternatives).toEqual([]);
  });

  it('marks a suggestion with no affordable replacement', () => {
    const rows = transferRows(
      transfers({ suggestions: [suggestion('Wissa', null, 0)], recommendedCount: 0 }),
    );
    expect(rows[0]).toMatchObject({ inName: null, verdict: 'skip', alternatives: [] });
  });

  it('returns nothing when there are no suggestions', () => {
    expect(transferRows(transfers({}))).toEqual([]);
  });
});

describe('hitAdvice', () => {
  it('explains a hit that is worth taking', () => {
    const advice = hitAdvice({
      transfers: transfers({
        suggestions: [
          suggestion('Wissa', 'Watkins', 3),
          suggestion('Mitoma', 'Mbeumo', 7),
        ],
        recommendedCount: 2,
        pointsHitCost: 4,
      }),
      leagueStandings: NOT_LEADING,
    });
    expect(advice).toMatch(
      /^The -4 is worth it: Mitoma for Mbeumo gains about 7\.0 pts/,
    );
  });

  it('explains why the next move is not worth a hit', () => {
    const advice = hitAdvice({
      transfers: transfers({
        suggestions: [
          suggestion('Wissa', 'Watkins', 3),
          suggestion('Mitoma', 'Mbeumo', 4.5),
        ],
        recommendedCount: 1,
      }),
      leagueStandings: NOT_LEADING,
    });
    expect(advice).toBe(
      "A -4 for Mitoma isn't worth it: the swap gains about 4.5 pts, short of the 6 needed to beat the hit with a margin.",
    );
  });

  it('says a big gain is skipped to protect a league lead', () => {
    const advice = hitAdvice({
      transfers: transfers({
        suggestions: [
          suggestion('Wissa', 'Watkins', 3),
          suggestion('Mitoma', 'Mbeumo', 8),
        ],
        recommendedCount: 1,
      }),
      leagueStandings: LEADING,
    });
    expect(advice).toMatch(/you lead a league/);
  });

  it('covers free transfers that handle everything, and no suggestions at all', () => {
    const covered = hitAdvice({
      transfers: transfers({
        suggestions: [suggestion('Wissa', 'Watkins', 3)],
        recommendedCount: 1,
        freeTransfers: 2,
      }),
      leagueStandings: NOT_LEADING,
    });
    expect(covered).toBe(
      'Your 2 free transfers cover every move worth making, so no hit is needed.',
    );
    expect(
      hitAdvice({ transfers: transfers({}), leagueStandings: NOT_LEADING }),
    ).toMatch(/No weak links/);
  });
});

describe('summary lines', () => {
  it('sums up the recommended transfers in one line', () => {
    expect(
      transferSummaryLine(
        transfers({
          suggestions: [
            suggestion('Wissa', 'Watkins', 3),
            suggestion('Mitoma', 'Mbeumo', 7),
          ],
          recommendedCount: 2,
          pointsHitCost: 4,
          projectedNetGain: 6,
        }),
      ),
    ).toBe('Wissa for Watkins, Mitoma for Mbeumo (+6.0 pts, one -4)');
    expect(transferSummaryLine(transfers({}))).toBe(
      'No transfer worth making. Roll it.',
    );
  });

  it('sums up the captain and vice in one line', () => {
    const salah = player('Salah', {
      nextFixtures: [
        { event: EVENT, opponentShortName: 'WHU', isHome: false, difficulty: 2 },
      ],
    });
    expect(
      captainSummaryLine(
        {
          captain: { player: salah, score: 9 },
          viceCaptain: { player: player('Haaland'), score: 8 },
          candidates: [],
        },
        EVENT,
      ),
    ).toBe('Salah, WHU (A), vice Haaland');
    expect(
      captainSummaryLine({ captain: null, viceCaptain: null, candidates: [] }, EVENT),
    ).toBe('No clear captain in this lineup.');
  });
});

describe('captainOptions', () => {
  it('ranks the top five with fixture, expected points, and c and v marked', () => {
    const candidates = ['Salah', 'Haaland', 'Palmer', 'Saka', 'Isak', 'Watkins'].map(
      (name, index) => ({
        player: player(name, { epNext: 8 - index }),
        score: 10 - index,
      }),
    );
    const [first, second] = candidates as [
      (typeof candidates)[0],
      (typeof candidates)[0],
    ];
    const options = captainOptions(
      { captain: first, viceCaptain: second, candidates },
      EVENT,
    );
    expect(options).toHaveLength(5);
    expect(options.map((o) => [o.rank, o.name, o.role, o.expectedPoints])).toEqual([
      [1, 'Salah', 'captain', 8],
      [2, 'Haaland', 'vice', 7],
      [3, 'Palmer', null, 6],
      [4, 'Saka', null, 5],
      [5, 'Isak', null, 4],
    ]);
    expect(options[0]?.fixture).toBe('LIV (H)');
  });

  it('returns nothing without candidates', () => {
    expect(
      captainOptions({ captain: null, viceCaptain: null, candidates: [] }, EVENT),
    ).toEqual([]);
  });
});

describe('gameweekTimeline', () => {
  const squad = [
    player('A', { teamId: 1 }),
    player('B', { teamId: 1 }),
    player('C', { teamId: 2 }),
  ];
  const base = {
    currentEvent: 12,
    squad: { squad } as AnalysisSummary['squad'],
  };

  it('counts squad players in each double and blank over the next five weeks', () => {
    const timeline = gameweekTimeline({
      ...base,
      chips: {
        doubleGameweeks: [{ event: 13, teamIds: [1, 9] }],
        blankGameweeks: [
          { event: 15, teamIds: [2] },
          { event: 30, teamIds: [1] },
        ],
        suggestions: [],
      },
    });
    expect(timeline.map((gw) => [gw.event, gw.doublePlayers, gw.blankPlayers])).toEqual(
      [
        [12, 0, 0],
        [13, 2, 0],
        [14, 0, 0],
        [15, 0, 1],
        [16, 0, 0],
      ],
    );
  });

  it('shows quiet weeks when no double or blank touches the squad', () => {
    const timeline = gameweekTimeline({
      ...base,
      chips: {
        doubleGameweeks: [{ event: 12, teamIds: [7] }],
        blankGameweeks: [],
        suggestions: [],
      },
    });
    expect(
      timeline.every((gw) => gw.doublePlayers === 0 && gw.blankPlayers === 0),
    ).toBe(true);
  });
});

describe('chipStamps', () => {
  it('lists all four chips in a fixed order with their state', () => {
    const stamps = chipStamps(
      ['wildcard'],
      [
        { chip: 'bench_boost', recommendation: 'play_now', reasonCodes: [] },
        { chip: 'triple_captain', recommendation: 'consider_soon', reasonCodes: [] },
        { chip: 'free_hit', recommendation: 'hold', reasonCodes: [] },
      ],
    );
    expect(stamps.map((s) => [s.chip, s.state, s.verdict])).toEqual([
      ['wildcard', 'used', 'Used'],
      ['free_hit', 'available', 'Available'],
      ['bench_boost', 'recommended', 'Play now'],
      ['triple_captain', 'recommended', 'Plan soon'],
    ]);
  });

  it('treats a chip with no suggestion and no use as available', () => {
    expect(chipStamps([], []).every((s) => s.state === 'available')).toBe(true);
  });
});

describe('priceRows', () => {
  it('describes confirmed and predicted moves in both directions', () => {
    const rows = priceRows([
      {
        player: player('Salah', { nowCost: 131 }),
        direction: 'rise',
        status: 'predicted',
      },
      {
        player: player('Watkins', { nowCost: 90 }),
        direction: 'fall',
        status: 'changed_today',
      },
    ]);
    expect(rows.map((r) => [r.name, r.price, r.direction, r.note])).toEqual([
      ['Salah', '£13.1m', 'rise', 'likely to rise'],
      ['Watkins', '£9.0m', 'fall', 'fell today'],
    ]);
  });

  it('returns nothing when there are no alerts', () => {
    expect(priceRows([])).toEqual([]);
  });
});

describe('formatting', () => {
  it('signs point gains and keeps one decimal', () => {
    expect(formatGain(3.24)).toBe('+3.2 pts');
    expect(formatGain(0)).toBe('+0.0 pts');
    expect(formatGain(-1.5)).toBe('-1.5 pts');
  });

  it('formats fpl tenths as millions', () => {
    expect(formatPrice(55)).toBe('£5.5m');
  });
});
