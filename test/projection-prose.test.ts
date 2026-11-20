import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { buildChatRequest } from '../lib/chat-prompt.js';
import { PROJECTION_GUIDE, REPORT_SYSTEM_PROMPT } from '../lib/coach-prompt.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import sampleJson from '../web/fixtures/sample-summary.json';

const sample = sampleJson as unknown as AnalysisSummary;

describe('how the prose names the numbers', () => {
  it("tells both prompts the projection is onze's and ep_next is fpl's", () => {
    expect(PROJECTION_GUIDE).toContain("Onze's own");
    expect(PROJECTION_GUIDE).toContain('never as FPL');
    expect(REPORT_SYSTEM_PROMPT).toContain(PROJECTION_GUIDE);
    const chat = buildChatRequest({
      analysisSummary: sample,
      history: [],
      question: 'Who should I captain?',
      model: 'test-model',
    });
    expect(String(chat.system)).toContain(PROJECTION_GUIDE);
  });

  it('quotes the onze projection with its breakdown in the basic report, never as fpl', () => {
    const report = writeFallbackReport(sample);
    expect(report.captaincy).toMatch(
      /Onze projection \d+\.\d: \d+% to play, \d+\.\d if he plays/,
    );
    if (sample.transfers.recommendedCount > 0) {
      expect(report.transfers).toContain('on the Onze projection this gameweek');
    }
    for (const section of Object.values(report)) {
      expect(section).not.toMatch(/FPL's (projection|expected)/);
      expect(section).not.toContain('expected points');
    }
  });
});
