import { EMPTY_PLAN } from './helpers/fixtures.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { writeReport } from '../web/report-writer.js';
import { makeSquadContext } from './helpers/fixtures.js';

const AI_REPORT = {
  summary: 'ai summary',
  transfers: 'ai transfers',
  captaincy: 'ai captaincy',
  chips: 'ai chips',
  priceAlerts: 'ai price alerts',
  formation: 'ai formation',
};

function makeSummary(): AnalysisSummary {
  return {
    managerName: 'Test Manager',
    teamName: 'Test FC',
    currentEvent: 10,
    currentEventDeadline: '2026-11-21T11:00:00Z',
    nextEvent: null,
    generatedAt: '2026-11-18T12:00:00Z',
    squad: makeSquadContext(),
    leagueStandings: [],
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

function stubAnthropicReply(status: number, body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('writeReport', () => {
  it('writes a basic report without calling anthropic when there is no key', async () => {
    const fetchMock = stubAnthropicReply(200, {});

    const result = await writeReport(makeSummary(), null);

    expect(result.source).toBe('basic');
    expect(result.errorMessage).toBeNull();
    expect(result.report.summary).toContain('Test FC');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the ai report when anthropic replies with valid json', async () => {
    stubAnthropicReply(200, {
      content: [{ type: 'text', text: JSON.stringify(AI_REPORT) }],
    });

    const result = await writeReport(makeSummary(), 'sk-ant-test');

    expect(result).toEqual({ report: AI_REPORT, source: 'ai', errorMessage: null });
  });

  it('falls back to a basic report and surfaces the error on a bad key', async () => {
    stubAnthropicReply(401, {
      error: { type: 'authentication_error', message: 'invalid' },
    });

    const result = await writeReport(makeSummary(), 'sk-ant-wrong');

    expect(result.source).toBe('basic');
    expect(result.errorMessage).toMatch(/rejected your api key/i);
    expect(result.report.summary).toContain('Test FC');
  });

  it('falls back with an error when the reply is not valid report json', async () => {
    stubAnthropicReply(200, { content: [{ type: 'text', text: 'not json' }] });

    const result = await writeReport(makeSummary(), 'sk-ant-test');

    expect(result.source).toBe('basic');
    expect(result.errorMessage).toMatch(/couldn't be read/);
  });
});
