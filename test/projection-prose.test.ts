import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { buildChatRequest } from '../lib/chat-prompt.js';
import {
  PLAIN_WORDS_GUIDE,
  REPORT_SYSTEM_PROMPT,
  buildCoachRequest,
} from '../lib/coach-prompt.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import { JARGON } from '../lib/plain-labels.js';
import sampleJson from '../web/fixtures/sample-summary.json';

const sample = sampleJson as unknown as AnalysisSummary;

describe('how the prose talks about the numbers', () => {
  it('gives both prompts the same plain-words guide, bands and all', () => {
    expect(REPORT_SYSTEM_PROMPT).toContain(PLAIN_WORDS_GUIDE);
    const chat = buildChatRequest({
      analysisSummary: sample,
      history: [],
      question: 'Who should I captain?',
      model: 'test-model',
    });
    expect(String(chat.system)).toContain(PLAIN_WORDS_GUIDE);
    expect(PLAIN_WORDS_GUIDE).toContain('"Nailed on" is a 90%+ chance of playing');
    expect(PLAIN_WORDS_GUIDE).toContain('"Likely to play" 60% to 89%');
    expect(PLAIN_WORDS_GUIDE).toContain('"Rotation risk" 30% to 59%');
    expect(PLAIN_WORDS_GUIDE).toContain('round numbers');
    expect(PLAIN_WORDS_GUIDE).toContain("never FPL's");
  });

  it('sends the labels and ready-made sentences with the data', () => {
    const request = buildCoachRequest(sample, 'test-model');
    const [message] = request.messages;
    const sent = JSON.parse(String(message?.content)) as Record<string, unknown>;

    expect(Array.isArray(sent.plainPlayers)).toBe(true);
    expect(sent.plainSentences).toMatchObject({
      captain: expect.stringMatching(
        /^Captain .+: Onze predicts \d+\.\d pts, the highest/,
      ),
    });
  });

  it('writes the basic report in plain words, with no stats jargon', () => {
    const report = writeFallbackReport(sample);
    expect(report.captaincy).toMatch(
      /^Captain .+: Onze predicts \d+\.\d pts, the highest in your (team|starting eleven)\./,
    );
    if (sample.transfers.recommendedCount > 0) {
      expect(report.transfers).toMatch(
        /Onze thinks .+ will score (about \d+|slightly) (more|fewer) points? than .+ this week\./,
      );
    }
    for (const section of Object.values(report)) {
      for (const word of JARGON) expect(section).not.toContain(word);
      expect(section).not.toContain('expected points');
    }
  });
});
