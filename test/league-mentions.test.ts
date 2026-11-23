import { EMPTY_PLAN } from './helpers/fixtures.js';
import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import type { LeagueStanding } from '../lib/analysis/types.js';
import { buildCoachRequest, REPORT_SYSTEM_PROMPT } from '../lib/coach-prompt.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import { makeSquadContext } from './helpers/fixtures.js';

function summaryWith(leagueStandings: LeagueStanding[]): AnalysisSummary {
  return {
    managerName: 'Test Manager',
    teamName: 'Test FC',
    currentEvent: 12,
    currentEventDeadline: '2026-11-21T11:00:00Z',
    nextEvent: null,
    generatedAt: '2026-11-18T12:00:00Z',
    squad: makeSquadContext(),
    leagueStandings,
    chipsUsed: [],
    transfers: {
      suggestions: [],
      recommendedCount: 0,
      freeTransfers: 1,
      pointsHitCost: 0,
      projectedNetGain: 0,
    },
    plan: EMPTY_PLAN,
    captaincy: { captain: null, viceCaptain: null, candidates: [] },
    chips: { doubleGameweeks: [], blankGameweeks: [], suggestions: [] },
    priceAlerts: { alerts: [] },
    lineup: { formation: '', startingXI: [], bench: [] },
  };
}

const MID_TABLE: LeagueStanding = {
  id: 1,
  name: 'Niger HQ FPL',
  rank: 231,
  previousRank: 240,
  totalEntries: 1200,
};
const LEADING: LeagueStanding = {
  id: 2,
  name: 'Office',
  rank: 1,
  previousRank: 2,
  totalEntries: 14,
};
const THIRD: LeagueStanding = {
  id: 3,
  name: 'Family',
  rank: 3,
  previousRank: 3,
  totalEntries: 9,
};

function sentNotableLeague(summary: AnalysisSummary): unknown {
  const [message] = buildCoachRequest(summary, 'test-model').messages;
  return (JSON.parse(message?.content as string) as { notableLeague: unknown })
    .notableLeague;
}

describe('basic report league mentions', () => {
  it('leaves leagues out when none is notable, even with several', () => {
    const { summary } = writeFallbackReport(
      summaryWith([MID_TABLE, { ...MID_TABLE, id: 9, name: 'Uni', rank: 12 }]),
    );
    expect(summary).not.toMatch(/Niger HQ FPL|Uni|ranked/);
  });

  it('names the league the manager leads, not the first one listed', () => {
    const { summary } = writeFallbackReport(summaryWith([MID_TABLE, LEADING]));
    expect(summary).toContain("You're top of Office.");
    expect(summary).not.toContain('Niger HQ FPL');
  });

  it('names a top three finish with its position', () => {
    const { summary } = writeFallbackReport(summaryWith([MID_TABLE, THIRD]));
    expect(summary).toContain("You're 3rd of 9 in Family.");
  });
});

describe('ai report league mentions', () => {
  it('hands claude the notable league, or null when there is none', () => {
    expect(sentNotableLeague(summaryWith([MID_TABLE, LEADING]))).toEqual(LEADING);
    expect(sentNotableLeague(summaryWith([MID_TABLE]))).toBeNull();
  });

  it('tells claude the notable league is the only one it may name', () => {
    expect(REPORT_SYSTEM_PROMPT).toMatch(/ONLY league you\s+may name/);
    expect(REPORT_SYSTEM_PROMPT).toMatch(/null, say nothing about leagues/);
  });
});
