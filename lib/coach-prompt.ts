import type Anthropic from '@anthropic-ai/sdk';
import { SENSEI_PERSONA } from './persona.js';
import type { AnalysisSummary } from './analysis-summary.js';

export interface CoachReport {
  summary: string;
  transfers: string;
  captaincy: string;
  chips: string;
  priceAlerts: string;
}

const REPORT_SYSTEM_PROMPT = `${SENSEI_PERSONA}

You are writing a gameweek coaching report from a pre-computed data
summary (JSON) describing the user's squad, transfer candidates,
captaincy candidates, chip timing signals, and price-change risk. The
JSON is the only source of truth — do not invent players, stats, or
fixtures that aren't in it.

Respond with ONLY a JSON object matching this exact shape — no markdown
fences, no commentary outside the JSON:
{
  "summary": string,
  "transfers": string,
  "captaincy": string,
  "chips": string,
  "priceAlerts": string
}`;

const MAX_REPORT_TOKENS = 1500;

export function buildCoachRequest(
  summary: AnalysisSummary,
  model: string,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_REPORT_TOKENS,
    system: REPORT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(summary) }],
  };
}

const REQUIRED_FIELDS = [
  'summary',
  'transfers',
  'captaincy',
  'chips',
  'priceAlerts',
] as const;

export function parseCoachResponse(rawText: string): CoachReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Coach LLM response was not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Coach LLM response was not a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (typeof record[field] !== 'string') {
      throw new Error(`Coach LLM response missing "${field}" field`);
    }
  }

  return parsed as CoachReport;
}
