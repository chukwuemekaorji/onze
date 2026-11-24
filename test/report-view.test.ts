import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { AnalysisPlayer } from '../lib/analysis/types.js';
import {
  captainOptions,
  chipStamps,
  formatGain,
  formatPrice,
  gameweekTimeline,
  hitAdvice,
  leagueRows,
  priceRows,
  transferRows,
} from '../web/report-view.js';
import { makeProjection } from './helpers/fixtures.js';

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
    teamName: 'Test FC',
    position: 'MID',
    nowCost: 80,
    form: 5,
    pointsPerGame: 5,
    epNext: 5,
    projection: makeProjection({ event: EVENT }),
    totalPoints: 50,
    selectedByPercent: 10,
    chanceOfPlayingNextRound: null,
    status: 'a',
    costChangeEvent: 0,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    nextFixtures: [
      {
        event: EVENT,
        opponentShortName: 'LIV',
        opponentName: 'LIV FC',
        isHome: true,
        difficulty: 3,
      },
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
  it("says the gain in plain words, with the incoming player's card", () => {
    const [row] = transferRows(
      {
        suggestions: [suggestion('Mitoma', 'Mbeumo', 2.6)],
        recommendedCount: 1,
        freeTransfers: 1,
        pointsHitCost: 0,
        projectedNetGain: 2.6,
      },
      EVENT,
    );
    expect(row?.sentence).toBe(
      'onze thinks Mbeumo will score about 3 more points than Mitoma this week.',
    );
    expect(row?.incoming).toEqual({
      name: 'Mbeumo',
      line: 'onze predicts 5.0 pts · Nailed on · Medium goal threat · Medium fixture',
      exact: [
        '90% chance of playing',
        '5.6 pts if he plays',
        '30% chance to score or assist if he plays',
      ],
    });
  });

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
      EVENT,
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
      EVENT,
    );
    expect(rows[0]).toMatchObject({
      inId: null,
      inName: null,
      verdict: 'skip',
      alternatives: [],
    });
  });

  it("carries the incoming player's id, so the swap can be replayed on the pitch", () => {
    const watkins = player('Watkins');
    const rows = transferRows(
      transfers({
        suggestions: [
          {
            outPlayer: player('Wissa'),
            reasonCodes: [],
            inCandidates: [watkins],
            expectedPointsGain: 3,
          },
        ],
        recommendedCount: 1,
      }),
      EVENT,
    );
    expect(rows[0]?.inId).toBe(watkins.id);
  });

  it('returns nothing when there are no suggestions', () => {
    expect(transferRows(transfers({}), EVENT)).toEqual([]);
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
      currentEvent: EVENT,
    });
    expect(advice).toMatch(
      /^The -4 is worth it: Mitoma for Mbeumo gains about 7\.0 points/,
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
      currentEvent: EVENT,
    });
    expect(advice).toBe(
      "A -4 for Mitoma isn't worth it: the swap gains about 4.5 points, short of the 6 needed to beat the hit with a margin.",
    );
  });

  it('says plainly when the next swap would gain nothing', () => {
    const advice = hitAdvice({
      transfers: transfers({
        suggestions: [
          suggestion('Wissa', 'Watkins', 3),
          suggestion('Mitoma', 'Mbeumo', -0.1),
        ],
        recommendedCount: 1,
      }),
      leagueStandings: NOT_LEADING,
      currentEvent: EVENT,
    });
    expect(advice).toBe(
      "No other swap would gain you points this week, so a -4 isn't worth it.",
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
      currentEvent: EVENT,
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
      currentEvent: EVENT,
    });
    expect(covered).toBe(
      'Your 2 free transfers cover every move worth making, so no hit is needed.',
    );
    expect(
      hitAdvice({
        transfers: transfers({}),
        leagueStandings: NOT_LEADING,
        currentEvent: EVENT,
      }),
    ).toMatch(/No weak links/);
  });
});

describe('captainOptions', () => {
  it('ranks the top five with fixture, expected points, and c and v marked', () => {
    const candidates = ['Salah', 'Haaland', 'Palmer', 'Saka', 'Isak', 'Watkins'].map(
      (name, index) => ({
        player: player(name, { form: 8 - index, epNext: 8 - index }),
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
    expect(options.map((o) => [o.rank, o.name, o.role])).toEqual([
      [1, 'Salah', 'captain'],
      [2, 'Haaland', 'vice'],
      [3, 'Palmer', null],
      [4, 'Saka', null],
      [5, 'Isak', null],
    ]);
    expect(options[0]?.fixture).toBe('LIV (H)');
  });

  it("shows a plain card for each option, never fpl's own figure", () => {
    const jackson = player('N.Jackson', {
      position: 'FWD',
      form: 11,
      epNext: 11,
      nextFixtures: [
        {
          event: EVENT,
          opponentShortName: 'BUR',
          opponentName: 'BUR FC',
          isHome: true,
          difficulty: 2,
        },
      ],
      projection: makeProjection({
        event: EVENT,
        points: 4.2,
        chanceOfPlaying: 0.8,
        pointsIfPlaying: 5.2,
        goalOrAssistChance: 0.45,
      }),
    });
    const [option] = captainOptions(
      {
        captain: { player: jackson, score: 4.2 },
        viceCaptain: null,
        candidates: [{ player: jackson, score: 4.2 }],
      },
      EVENT,
    );
    expect(option?.card.line).toBe(
      'onze predicts 4.2 pts · Likely to play · High goal threat · Easy fixture',
    );
    expect(option?.card.exact).toEqual([
      '80% chance of playing',
      '5.2 pts if he plays',
      '45% chance to score or assist if he plays',
    ]);
    expect(option?.predicted).toBe(4.2);
    expect(JSON.stringify(option)).not.toContain('11');
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
      ['bench_boost', 'recommended', 'Play this week'],
      ['triple_captain', 'recommended', 'Plan soon'],
    ]);
  });

  it('treats a chip with no suggestion and no use as available', () => {
    expect(chipStamps([], []).every((s) => s.state === 'available')).toBe(true);
  });
});

describe('priceRows', () => {
  it('labels every alert as this gameweek, never today', () => {
    const rows = priceRows([
      {
        player: player('Salah', { nowCost: 131 }),
        direction: 'rise',
        status: 'demand_this_gameweek',
      },
      {
        player: player('Isak', { nowCost: 85 }),
        direction: 'fall',
        status: 'demand_this_gameweek',
      },
      {
        player: player('Konsa', { nowCost: 49 }),
        direction: 'rise',
        status: 'changed_this_gameweek',
      },
      {
        player: player('Watkins', { nowCost: 90 }),
        direction: 'fall',
        status: 'changed_this_gameweek',
      },
    ]);
    expect(rows.map((r) => [r.name, r.price, r.direction, r.note])).toEqual([
      ['Salah', '£13.1m', 'rise', 'heavily bought this gameweek'],
      ['Isak', '£8.5m', 'fall', 'heavily sold this gameweek'],
      ['Konsa', '£4.9m', 'rise', 'rose this gameweek'],
      ['Watkins', '£9.0m', 'fall', 'fell this gameweek'],
    ]);
    expect(rows.some((r) => r.note.includes('today'))).toBe(false);
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

describe('leagueRows', () => {
  const standing = (rank: number, previousRank: number, totalEntries = 1200) => ({
    id: rank * 1000 + previousRank,
    name: 'League',
    rank,
    previousRank,
    totalEntries,
  });

  it('lists every league with its position and movement since last gameweek', () => {
    const rows = leagueRows([
      standing(231, 240),
      standing(7, 4, 14),
      standing(1, 1, 9),
    ]);
    expect(rows.map((r) => [r.position, r.movement, r.places])).toEqual([
      ['231st of 1,200', 'up', 9],
      ['7th of 14', 'down', 3],
      ['1st of 9', 'same', 0],
    ]);
  });

  it('uses the right ordinal for the teens', () => {
    expect(
      leagueRows([standing(12, 12), standing(113, 113)]).map((r) => r.position),
    ).toEqual(['12th of 1,200', '113th of 1,200']);
  });

  it('marks a league with no previous rank, or no rank yet, as new', () => {
    const [joined, unranked] = leagueRows([standing(5, 0, 20), standing(0, 0, 20)]);
    expect(joined).toMatchObject({ movement: 'new', position: '5th of 20' });
    expect(unranked).toMatchObject({ movement: 'new', position: 'not ranked yet' });
  });

  it('returns nothing when the manager is in no leagues', () => {
    expect(leagueRows([])).toEqual([]);
  });
});
