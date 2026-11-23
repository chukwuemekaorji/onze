import { describe, expect, it } from 'vitest';
import type { PlanWeek, PlannedSwap, TransferPlan } from '../lib/analysis/planner.js';
import type { AnalysisPlayer, FixtureDifficulty } from '../lib/analysis/types.js';
import {
  HOW_ONZE_PREDICTS,
  JARGON,
  aboutPoints,
  captainSentence,
  cardLine,
  cleanSheetLevel,
  exactNumbers,
  fixtureEase,
  goalThreatLevel,
  labelSentence,
  planOutlook,
  planReasonSentence,
  planWeekHeadline,
  plainPlayer,
  playingLabel,
  predictsPoints,
  transferSentence,
} from '../lib/plain-labels.js';
import { makePlayer, makeProjection } from './helpers/fixtures.js';

const EVENT = 1;

function fixture(event: number, difficulty: number): FixtureDifficulty {
  return { event, difficulty, isHome: true, opponentShortName: 'OPP' };
}

function player(overrides: Partial<AnalysisPlayer> = {}): AnalysisPlayer {
  return makePlayer({ nextFixtures: [fixture(EVENT, 2)], ...overrides });
}

describe('playingLabel', () => {
  it('bands the chance of playing at 90, 60 and 30%', () => {
    expect(playingLabel(1, 'a')).toBe('Nailed on');
    expect(playingLabel(0.9, 'a')).toBe('Nailed on');
    expect(playingLabel(0.89, 'a')).toBe('Likely to play');
    expect(playingLabel(0.6, 'd')).toBe('Likely to play');
    expect(playingLabel(0.59, 'a')).toBe('Rotation risk');
    expect(playingLabel(0.3, 'a')).toBe('Rotation risk');
    expect(playingLabel(0.29, 'a')).toBe('Unlikely to play');
    expect(playingLabel(0, 'u')).toBe('Unlikely to play');
  });

  it("lets fpl's injury and suspension news win over the chance", () => {
    expect(playingLabel(0, 'i')).toBe('Injured');
    expect(playingLabel(0.25, 'i')).toBe('Injured');
    expect(playingLabel(0, 's')).toBe('Suspended');
  });

  it('rejects a chance outside 0 to 1', () => {
    expect(() => playingLabel(1.2, 'a')).toThrow('from 0 to 1');
    expect(() => playingLabel(Number.NaN, 'a')).toThrow('from 0 to 1');
  });
});

describe('goal threat and clean sheet levels', () => {
  it('bands the chance to score or assist at 35 and 20%', () => {
    expect(goalThreatLevel(0.54)).toBe('High');
    expect(goalThreatLevel(0.35)).toBe('High');
    expect(goalThreatLevel(0.34)).toBe('Medium');
    expect(goalThreatLevel(0.2)).toBe('Medium');
    expect(goalThreatLevel(0.19)).toBe('Low');
  });

  it('bands the clean sheet chance at 30 and 18%', () => {
    expect(cleanSheetLevel(0.42)).toBe('Good');
    expect(cleanSheetLevel(0.3)).toBe('Good');
    expect(cleanSheetLevel(0.29)).toBe('Fair');
    expect(cleanSheetLevel(0.18)).toBe('Fair');
    expect(cleanSheetLevel(0.17)).toBe('Poor');
  });

  it('rejects a chance that is not one', () => {
    expect(() => goalThreatLevel(-0.1)).toThrow('from 0 to 1');
    expect(() => cleanSheetLevel(2)).toThrow('from 0 to 1');
  });
});

describe('fixtureEase', () => {
  it("reads fpl's difficulty: 2 or less easy, 3 medium, 4 or more tough", () => {
    expect(fixtureEase([fixture(1, 2)], 1)).toBe('Easy');
    expect(fixtureEase([fixture(1, 3)], 1)).toBe('Medium');
    expect(fixtureEase([fixture(1, 4)], 1)).toBe('Tough');
    expect(fixtureEase([fixture(1, 5), fixture(2, 2)], 1)).toBe('Tough');
  });

  it('averages a double, and has nothing to rate in a blank', () => {
    expect(fixtureEase([fixture(1, 2), fixture(1, 2)], 1)).toBe('Easy');
    expect(fixtureEase([fixture(1, 2), fixture(1, 5)], 1)).toBe('Medium');
    expect(fixtureEase([fixture(2, 2)], 1)).toBeNull();
  });
});

describe('points in words', () => {
  it('quotes a prediction to one decimal place', () => {
    expect(predictsPoints(5.36)).toBe('Onze predicts 5.4 pts');
    expect(predictsPoints(0)).toBe('Onze predicts 0.0 pts');
  });

  it('rounds a difference to a whole number, as people say it', () => {
    expect(aboutPoints(2.97)).toBe('about 3 more points');
    expect(aboutPoints(1.35)).toBe('about 1 more point');
    expect(aboutPoints(0.3)).toBe('slightly more points');
    expect(aboutPoints(-2.2)).toBe('about 2 fewer points');
    expect(() => aboutPoints(Number.POSITIVE_INFINITY)).toThrow('must be a number');
  });
});

describe('player cards', () => {
  const haaland = player({
    webName: 'Haaland',
    position: 'FWD',
    projection: makeProjection({
      points: 7.31,
      chanceOfPlaying: 0.96,
      pointsIfPlaying: 7.6,
      goalOrAssistChance: 0.54,
    }),
  });
  const gabriel = player({
    webName: 'Gabriel',
    position: 'DEF',
    nextFixtures: [fixture(EVENT, 3)],
    projection: makeProjection({
      points: 5.57,
      chanceOfPlaying: 0.95,
      goalOrAssistChance: 0.16,
      cleanSheetChance: 0.42,
    }),
  });

  it('reads like the example card', () => {
    expect(cardLine(haaland, EVENT)).toBe(
      'Onze predicts 7.3 pts · Nailed on · High goal threat · Easy fixture',
    );
    expect(cardLine(gabriel, EVENT)).toBe(
      'Onze predicts 5.6 pts · Nailed on · Low goal threat · Good chance of a clean sheet · Medium fixture',
    );
  });

  it('gives a keeper no goal threat, and says when there is no match', () => {
    const keeper = player({
      position: 'GK',
      nextFixtures: [],
      projection: makeProjection({
        points: 0,
        goalOrAssistChance: null,
        cleanSheetChance: null,
      }),
    });
    expect(plainPlayer(keeper, EVENT)).toMatchObject({
      goalThreat: null,
      cleanSheet: null,
      fixture: null,
    });
    expect(cardLine(keeper, EVENT)).toContain('No match this week');
  });

  it('keeps the exact numbers for the tap-to-expand', () => {
    expect(exactNumbers(gabriel)).toEqual([
      '95% chance of playing',
      `${gabriel.projection.pointsIfPlaying.toFixed(1)} pts if he plays`,
      '16% chance to score or assist if he plays',
      '42% chance of a clean sheet',
    ]);
  });

  it('says the same labels as a sentence for the written report', () => {
    expect(labelSentence(haaland, EVENT)).toBe(
      'Haaland is nailed on, with a high goal threat and an easy fixture.',
    );
    expect(labelSentence(gabriel, EVENT)).toBe(
      'Gabriel is nailed on, with a low goal threat, a good chance of a clean sheet and a medium fixture.',
    );
  });
});

describe('transfer and captain sentences', () => {
  const gabriel = player({ webName: 'Gabriel' });
  const dasilva = player({ webName: 'Dasilva' });

  it('reads like the example transfer line', () => {
    expect(transferSentence(gabriel, dasilva, 2.97)).toBe(
      'Onze thinks Gabriel will score about 3 more points than Dasilva this week.',
    );
  });

  it('only calls the captain the highest in the team when he is', () => {
    const haaland = player({
      webName: 'Haaland',
      projection: makeProjection({ points: 7.31 }),
    });
    const benched = player({ projection: makeProjection({ points: 8 }) });
    expect(captainSentence(haaland, [haaland, gabriel])).toBe(
      'Captain Haaland: Onze predicts 7.3 pts, the highest in your team.',
    );
    expect(captainSentence(haaland, [haaland, benched])).toBe(
      'Captain Haaland: Onze predicts 7.3 pts, the highest in your starting eleven.',
    );
  });
});

describe('the explainer', () => {
  it('uses none of the jargon the ui avoids', () => {
    for (const word of JARGON) expect(HOW_ONZE_PREDICTS).not.toContain(word);
  });
});

function swap(outName: string, inName: string, hit = false): PlannedSwap {
  const planPlayer = (webName: string, id: number) => ({
    id,
    webName,
    teamName: 'Arsenal',
    position: 'DEF' as const,
    nowCost: 50,
  });
  return {
    out: planPlayer(outName, outName.length),
    in: planPlayer(inName, inName.length + 100),
    gain: 3,
    hit,
  };
}

function week(event: number, overrides: Partial<PlanWeek> = {}): PlanWeek {
  return {
    event,
    swaps: [],
    freeTransfers: 1,
    freeTransfersAfter: 2,
    hits: 0,
    bankAfter: 0,
    captain: null,
    predictedPoints: 50,
    reason: { kind: 'nothing_worth_it' },
    ...overrides,
  };
}

function planOf(weeks: PlanWeek[]): TransferPlan {
  return {
    weeks,
    weekWeights: weeks.map(() => 1),
    weightedPoints: 0,
    hitCost: 0,
    objective: 0,
    beamWidth: 40,
  };
}

describe('plan headlines', () => {
  it('reads like the example timeline', () => {
    expect(planWeekHeadline(week(12, { swaps: [swap('Dasilva', 'Gabriel')] }))).toBe(
      'GW12: Dasilva → Gabriel (free)',
    );
    expect(planWeekHeadline(week(13))).toBe("GW13: Save your transfer (you'll have 2)");
    expect(
      planWeekHeadline(
        week(14, {
          freeTransfers: 2,
          swaps: [swap('Henderson', 'McGinn'), swap('Hall', 'Gabriel')],
        }),
      ),
    ).toBe('GW14: Henderson → McGinn and Hall → Gabriel (free, free)');
  });

  it('marks a hit, and says when the bank is already full', () => {
    expect(
      planWeekHeadline(
        week(12, { swaps: [swap('A', 'B'), swap('C', 'D', true)], hits: 1 }),
      ),
    ).toBe('GW12: A → B and C → D (free, -4)');
    expect(
      planWeekHeadline(week(15, { freeTransfers: 5, freeTransfersAfter: 5 })),
    ).toBe("GW15: Save your transfers (you'll stay on 5, the most you can bank)");
  });
});

describe('plan reasons', () => {
  it('has one plain sentence for every kind of reason', () => {
    expect(
      planReasonSentence({
        kind: 'replaces_absent',
        outName: 'Saka',
        status: 'injured',
      }),
    ).toBe('Saka is injured.');
    expect(planReasonSentence({ kind: 'double', teamName: 'Arsenal', event: 14 })).toBe(
      'Arsenal play twice in GW14.',
    );
    expect(
      planReasonSentence({
        kind: 'easy_run',
        teamName: 'Arsenal',
        fromEvent: 14,
        startsHere: true,
      }),
    ).toBe("Arsenal's easy run starts in GW14.");
    expect(
      planReasonSentence({
        kind: 'easy_run',
        teamName: 'Arsenal',
        fromEvent: 14,
        startsHere: false,
      }),
    ).toBe('Arsenal have easy fixtures from GW14.');
    expect(
      planReasonSentence({
        kind: 'outscores',
        inName: 'Gabriel',
        outName: 'Dasilva',
        points: 13.8,
        weeks: 5,
      }),
    ).toBe(
      'Onze thinks Gabriel will score about 14 more points than Dasilva over the next 5 weeks.',
    );
    expect(
      planReasonSentence({
        kind: 'save_for',
        nextEvent: 14,
        freeTransfersThen: 2,
        swapsThen: 2,
      }),
    ).toBe('Saving lets you make 2 moves in GW14.');
    expect(
      planReasonSentence({
        kind: 'save_for',
        nextEvent: 14,
        freeTransfersThen: 2,
        swapsThen: 1,
      }),
    ).toBe('No swap is worth a transfer until GW14.');
    expect(planReasonSentence({ kind: 'nothing_worth_it' })).toBe(
      'No swap gains enough to be worth a transfer.',
    );
  });
});

describe('planOutlook', () => {
  const later = week(13, {
    freeTransfers: 2,
    swaps: [swap('Henderson', 'McGinn'), swap('Hall', 'Gabriel')],
  });

  it('names the saved weeks and the next move, in one sentence', () => {
    const plan = planOf([
      week(11, { swaps: [swap('Dasilva', 'Gabriel')] }),
      week(12),
      later,
    ]);
    expect(planOutlook(plan)).toBe(
      'Looking ahead, the 3-week outlook saves your transfer in GW12 and has Henderson → McGinn and Hall → Gabriel in GW13.',
    );
    expect(planOutlook(planOf([week(11), later]))).toBe(
      'Looking ahead, the 2-week outlook has Henderson → McGinn and Hall → Gabriel in GW13.',
    );
  });

  it('never speaks about this week, whatever the first week holds', () => {
    const quiet = planOutlook(planOf([week(11), week(12), later]));
    const busy = planOutlook(
      planOf([week(11, { swaps: [swap('Dasilva', 'Gabriel')] }), week(12), later]),
    );
    expect(busy).toBe(quiet);
    expect(busy).not.toContain('this week');
    expect(busy).not.toContain('Dasilva');
  });

  it('says when nothing later is worth a transfer, and nothing without later weeks', () => {
    expect(planOutlook(planOf([week(11), week(12)]))).toBe(
      'Looking ahead, the 2-week outlook has no transfer worth making in the weeks after.',
    );
    expect(planOutlook(planOf([week(11)]))).toBe('');
    expect(planOutlook(planOf([]))).toBe('');
  });

  it('is one sentence with none of the jargon the ui avoids', () => {
    const text = planOutlook(planOf([week(11), week(12), later]));
    expect(text.match(/\. /g)).toBeNull();
    for (const word of JARGON) expect(text).not.toContain(word);
  });
});
