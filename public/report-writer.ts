import type { AnalysisSummary } from '../lib/analysis-summary.js';
import { buildCoachRequest, parseCoachResponse } from '../lib/coach-prompt.js';
import type { CoachReport } from '../lib/coach-prompt.js';
import { writeFallbackReport } from '../lib/fallback-writer.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../lib/model.js';
import { AnthropicCallError, sendMessage } from './anthropic-client.js';

export type ReportSource = 'ai' | 'basic';

export interface WrittenReport {
  report: CoachReport;
  source: ReportSource;
  /** set when an ai report was attempted and failed */
  errorMessage: string | null;
}

const UNREADABLE_REPLY_MESSAGE =
  "Claude's reply couldn't be read, so this is a basic report instead. Try refreshing.";

// a failed ai call still yields a usable report, but the error is always surfaced
export async function writeReport(
  summary: AnalysisSummary,
  apiKey: string | null,
): Promise<WrittenReport> {
  if (!apiKey) {
    return {
      report: writeFallbackReport(summary),
      source: 'basic',
      errorMessage: null,
    };
  }

  try {
    const text = await sendMessage(
      apiKey,
      buildCoachRequest(summary, DEFAULT_ANTHROPIC_MODEL),
    );
    return { report: parseCoachResponse(text), source: 'ai', errorMessage: null };
  } catch (err) {
    const errorMessage =
      err instanceof AnthropicCallError ? err.message : UNREADABLE_REPLY_MESSAGE;
    return { report: writeFallbackReport(summary), source: 'basic', errorMessage };
  }
}
