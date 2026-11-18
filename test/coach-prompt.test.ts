import { describe, it, expect } from 'vitest';
import { parseCoachResponse } from '../lib/coach-prompt.js';

const VALID_REPORT = {
  summary: 'a',
  transfers: 'b',
  captaincy: 'c',
  chips: 'd',
  priceAlerts: 'e',
};

describe('parseCoachResponse', () => {
  it('parses a plain JSON response', () => {
    expect(parseCoachResponse(JSON.stringify(VALID_REPORT))).toEqual(VALID_REPORT);
  });

  it('strips a markdown code fence Claude sometimes adds despite instructions', () => {
    const fenced = '```json\n' + JSON.stringify(VALID_REPORT) + '\n```';
    expect(parseCoachResponse(fenced)).toEqual(VALID_REPORT);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCoachResponse('not json')).toThrow('was not valid JSON');
  });

  it('throws when a required field is missing', () => {
    const { summary: _summary, ...incomplete } = VALID_REPORT;
    expect(() => parseCoachResponse(JSON.stringify(incomplete))).toThrow(
      'missing "summary"',
    );
  });
});
