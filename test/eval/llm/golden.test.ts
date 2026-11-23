import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { checkReport } from '../../../lib/eval/llm/check-report.js';
import { writeFallbackReport } from '../../../lib/fallback-writer.js';

const GOLDEN_DIR = join(import.meta.dirname, '../../fixtures/golden');
const REPLIES_DIR = join(GOLDEN_DIR, 'replies');

interface Golden {
  id: string;
  title: string;
  summary: AnalysisSummary;
}

const golden: Golden[] = readdirSync(GOLDEN_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(GOLDEN_DIR, file), 'utf8')) as Golden);

const replies = existsSync(REPLIES_DIR)
  ? readdirSync(REPLIES_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map(
        (file) =>
          JSON.parse(readFileSync(join(REPLIES_DIR, file), 'utf8')) as {
            scenario: string;
            text: string;
          },
      )
  : [];

/** every violation on one line each, so a failure reads straight off the test output */
function described(result: ReturnType<typeof checkReport>): string[] {
  return result.violations.map(
    (violation) => `[${violation.check}] ${violation.detail}: "${violation.sentence}"`,
  );
}

describe('the golden set', () => {
  it('has about fifteen scenarios with unique ids and anonymised managers', () => {
    expect(golden.length).toBeGreaterThanOrEqual(15);
    expect(new Set(golden.map((entry) => entry.id)).size).toBe(golden.length);
    for (const entry of golden) {
      expect(entry.summary.managerName).toBe('Golden Manager');
      expect(entry.summary.teamName).toBe('Golden XI');
    }
  });
});

describe.each(golden)('the basic report for $id', (entry) => {
  it('passes every check', () => {
    expect(
      described(checkReport(writeFallbackReport(entry.summary), entry.summary)),
    ).toEqual([]);
  });
});

// saved by npm run eval:live; none until it has been run with a key
describe.each(replies)("claude's saved reply for $scenario", (reply) => {
  it('passes every check', () => {
    const scenario = golden.find((entry) => entry.id === reply.scenario);
    if (scenario === undefined) throw new Error(`no golden scenario ${reply.scenario}`);
    expect(described(checkReport(reply.text, scenario.summary))).toEqual([]);
  });
});
